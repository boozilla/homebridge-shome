import axios from 'axios';
import CryptoJS from 'crypto-js';
import { Logger } from 'homebridge';

const BASE_URL = 'https://shome-api.samsung-ihp.com';
const APP_REGST_ID = '6110736314d9eef6baf393f3e43a5342f9ccde6ef300d878385acd9264cf14d5';
const CHINA_APP_REGST_ID = 'SHOME==6110736314d9eef6baf393f3e43a5342f9ccde6ef300d878385acd9264cf14d5';
const LANGUAGE = 'KOR';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Define and export interfaces for device types
export interface MainDevice {
    thngId: string;
    thngModelTypeName: string;
    nickname: string;
    [key: string]: unknown;
}

export interface SubDevice {
    deviceId: string;
    nickname: string;
    [key: string]: unknown;
}

type QueueTask<T = unknown> = {
    request: () => Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
    authRetry: boolean;
};

export class ShomeClient {
  private cachedAccessToken: string | null = null;
  private ihdId: string | null = null;
  private tokenExpiry: number = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private requestQueue: QueueTask<any>[] = [];
  private isProcessing = false;

  constructor(
        private readonly log: Logger,
        private readonly username: string,
        private readonly password: string,
        private readonly deviceId: string,
  ) {
  }

  private async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject, authRetry: false });
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }
    this.isProcessing = true;
    const task = this.requestQueue.shift()!;
    let retries = 0;

    const execute = async () => {
      try {
        const result = await task.request();
        task.resolve(result);
        this.isProcessing = false;
        this.processQueue();
      } catch (error) {
        const isAuthError = axios.isAxiosError(error) && error.response?.status === 401;

        if (isAuthError && !task.authRetry) {
          this.log.warn('API authentication failed (401). Retrying after refreshing token.');
          this.cachedAccessToken = null;
          this.tokenExpiry = 0;
          task.authRetry = true;
          setTimeout(execute, 100);
        } else if (!isAuthError && retries < MAX_RETRIES) {
          retries++;
          const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, retries - 1);
          this.log.warn(`Request failed. Retrying in ${backoffTime}ms... (Attempt ${retries}/${MAX_RETRIES})`);
          setTimeout(execute, backoffTime);
        } else {
          this.log.error(`Request failed after ${MAX_RETRIES} retries.`, error);
          task.reject(error);
          this.isProcessing = false;
          this.processQueue();
        }
      }
    };

    await execute();
  }

  async login(): Promise<string | null> {
    return this.enqueue(() => this.performLogin());
  }

  private async performLogin(): Promise<string | null> {
    if (!this.isTokenExpired()) {
      return this.cachedAccessToken;
    }

    try {
      const createDate = this.getDateTime();
      const hashedPassword = this.sha512(this.password);
      const hashData = this.sha512(`IHRESTAPI${this.username}${hashedPassword}${this.deviceId}` +
                `${APP_REGST_ID}${CHINA_APP_REGST_ID}${LANGUAGE}${createDate}`);

      const response = await axios.put(`${BASE_URL}/v18/users/login`, null, {
        params: {
          appRegstId: APP_REGST_ID,
          chinaAppRegstId: CHINA_APP_REGST_ID,
          createDate: createDate,
          hashData: hashData,
          language: LANGUAGE,
          mobileDeviceIdno: this.deviceId,
          password: hashedPassword,
          userId: this.username,
        },
      });

      if (response.data && response.data.accessToken) {
        this.cachedAccessToken = response.data.accessToken;
        this.ihdId = response.data.ihdId;

        const payload = JSON.parse(Buffer.from(this.cachedAccessToken!.split('.')[1], 'base64').toString());
        this.tokenExpiry = payload.exp * 1000;

        this.log.info('Successfully logged in to sHome API.');
        return this.cachedAccessToken;
      } else {
        this.log.error('Login failed: Invalid credentials or API error.');
        return null;
      }
    } catch (error) {
      this.log.error(`Login error: ${error}`);
      throw error;
    }
  }

  async getDeviceList(): Promise<MainDevice[]> {
    return this.enqueue(async () => {
      const token = await this.performLogin();
      if (!token || !this.ihdId) {
        return [];
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${this.ihdId}${createDate}`);

      const response = await axios.get(`${BASE_URL}/v16/settings/${this.ihdId}/devices/`, {
        params: { createDate, hashData },
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return response.data.deviceList || [];
    });
  }

  async getDeviceInfo(thingId: string, type: string): Promise<SubDevice[] | null> {
    return this.enqueue(async () => {
      const token = await this.performLogin();
      if (!token) {
        return null;
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${thingId}${createDate}`);
      const typePath = type.toLowerCase().replace(/_/g, '');

      const response = await axios.get(`${BASE_URL}/v18/settings/${typePath}/${thingId}`, {
        params: { createDate, hashData },
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return response.data.deviceInfoList || null;
    });
  }

  async setDevice(thingId: string, deviceId: string, type: string, controlType: string, state: string, nickname?: string): Promise<boolean> {
    return this.enqueue(async () => {
      const token = await this.performLogin();
      if (!token) {
        return false;
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${thingId}${deviceId}${state}${createDate}`);
      const typePath = type.toLowerCase().replace(/_/g, '');
      const controlPath = controlType.toLowerCase().replace(/_/g, '-');

      await axios.put(`${BASE_URL}/v18/settings/${typePath}/${thingId}/${deviceId}/${controlPath}`, null, {
        params: {
          createDate,
          [controlType === 'WINDSPEED' ? 'mode' : 'state']: state,
          hashData,
        },
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const displayName = nickname || `${thingId}/${deviceId}`;
      this.log.info(`[${displayName}] state set to ${state}.`);
      return true;
    });
  }

  async unlockDoorlock(thingId: string, nickname?: string): Promise<boolean> {
    return this.enqueue(async () => {
      const token = await this.performLogin();
      if (!token) {
        return false;
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${thingId}${createDate}`);

      await axios.put(`${BASE_URL}/v16/settings/doorlocks/${thingId}/open-mode`, null, {
        params: {
          createDate,
          pin: '',
          hashData,
        },
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const displayName = nickname || thingId;
      this.log.info(`Unlocked [${displayName}].`);
      return true;
    });
  }

  private sha512(input: string): string {
    return CryptoJS.SHA512(input).toString();
  }

  private isTokenExpired(): boolean {
    return !this.cachedAccessToken || Date.now() >= this.tokenExpiry;
  }

  private getDateTime(): string {
    const now = new Date();
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
            `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  }
}
