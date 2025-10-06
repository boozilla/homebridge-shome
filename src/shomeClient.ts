import axios from 'axios';
import CryptoJS from 'crypto-js';
import { Logger } from 'homebridge';

const BASE_URL = 'https://shome-api.samsung-ihp.com';
const APP_REGST_ID = '6110736314d9eef6baf393f3e43a5342f9ccde6ef300d878385acd9264cf14d5';
const CHINA_APP_REGST_ID = 'SHOME==6110736314d9eef6baf393f3e43a5342f9ccde6ef300d878385acd9264cf14d5';
const LANGUAGE = 'KOR';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const REQUEST_DELAY_MS = 300; // 각 API 요청 사이의 딜레이 (ms)

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

export interface Visitor {
    sttId: string;
    thumbNail: string;
    recodDt: string;
    deviceLabel: string;
}

export interface ParkingEvent {
    car_no: string;
    park_date: string;
    unit: 'in' | 'out';
}

export interface ExpenseItem {
    money: number;
    name: string;
}

export interface ExpenseBundle {
    money: number;
    name: string;
}

export interface ExpenseTotal {
    money: number;
    name: string;
}

export interface MaintenanceFeeData {
    search_year: string;
    search_month: string;
    expense_item: ExpenseItem[];
    expense_bundle: ExpenseBundle[];
    expense_total: ExpenseTotal[];
}

type QueueTask<T = unknown> = {
    request: () => Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
    deviceId?: string;
};

export class ShomeClient {
  private cachedAccessToken: string | null = null;
  private ihdId: string | null = null;
  private homeId: string | null = null;
  private tokenExpiry: number = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private putQueue: QueueTask<any>[] = [];
  private isProcessingPut = false;
  private loginPromise: Promise<string | null> | null = null;
  private pendingPutRequests = new Set<string>();

  constructor(
        private readonly log: Logger,
        private readonly username: string,
        private readonly password: string,
        private readonly deviceId: string,
  ) {
  }

  private login(): Promise<string | null> {
    if (!this.isTokenExpired()) {
      return Promise.resolve(this.cachedAccessToken);
    }

    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = new Promise((resolve, reject) => {
      this.putQueue.unshift({ // Prioritize login by adding to the front of the queue
        request: () => this.performLogin(),
        resolve,
        reject,
      });
      this.processPutQueue();
    });

    // Clean up the promise once it's settled
    this.loginPromise.finally(() => {
      this.loginPromise = null;
    });

    return this.loginPromise;
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
        this.homeId = response.data.homeId;

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

  private enqueuePut<T>(request: () => Promise<T>, deviceId?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.putQueue.push({ request, resolve, reject, deviceId });
      this.processPutQueue();
    });
  }

  private async processPutQueue(): Promise<void> {
    if (this.isProcessingPut) {
      return;
    }
    this.isProcessingPut = true;

    while (this.putQueue.length > 0) {
      const task = this.putQueue.shift()!;
      if (task.deviceId) {
        this.pendingPutRequests.add(task.deviceId);
      }
      try {
        const result = await this.executeWithRetries(task.request, true);
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      } finally {
        if (task.deviceId) {
          this.pendingPutRequests.delete(task.deviceId);
        }
      }
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    this.isProcessingPut = false;
  }

  private async executeWithRetries<T>(request: () => Promise<T>, isQueued = false): Promise<T> {
    let retries = 0;
    while (true) {
      try {
        if (!isQueued) {
          await this.login();
        }
        return await request();
      } catch (error) {
        const isAuthError = axios.isAxiosError(error) && error.response?.status === 401;

        if (isAuthError) {
          this.log.warn('API authentication failed (401). Invalidating token.');
          this.cachedAccessToken = null;
          this.tokenExpiry = 0;
        }

        if (retries >= MAX_RETRIES) {
          this.log.error(`Request failed after ${MAX_RETRIES} retries. Giving up.`, error);
          throw error;
        }

        retries++;
        const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, retries - 1);
        if (!isAuthError) {
          this.log.warn(`Request failed. Retrying in ${backoffTime}ms... (Attempt ${retries}/${MAX_RETRIES})`);
        }
        await new Promise(resolve => setTimeout(resolve, backoffTime));

        await this.login();
      }
    }
  }

  public isDeviceBusy(deviceId: string): boolean {
    return this.pendingPutRequests.has(deviceId);
  }

  async getDeviceList(): Promise<MainDevice[]> {
    return this.executeWithRetries(async () => {
      const token = this.cachedAccessToken;
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
    return this.executeWithRetries(async () => {
      const token = this.cachedAccessToken;
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

  async setDevice(thingId: string, subDeviceId: string, type: string, controlType: string, state: string, nickname?: string): Promise<boolean> {
    const deviceId = `${thingId}-${subDeviceId}`;
    const request = async () => {
      const token = this.cachedAccessToken;
      if (!token) {
        return false;
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${thingId}${subDeviceId}${state}${createDate}`);
      const typePath = type.toLowerCase().replace(/_/g, '');
      const controlPath = controlType.toLowerCase().replace(/_/g, '-');

      await axios.put(`${BASE_URL}/v18/settings/${typePath}/${thingId}/${subDeviceId}/${controlPath}`, null, {
        params: {
          createDate,
          [controlType === 'WINDSPEED' ? 'mode' : 'state']: state,
          hashData,
        },
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const displayName = nickname || deviceId;
      this.log.info(`[${displayName}] state set to ${state}.`);
      return true;
    };

    return this.enqueuePut(request, deviceId);
  }

  async unlockDoorlock(thingId: string, nickname?: string): Promise<boolean> {
    const deviceId = thingId;
    const request = async () => {
      const token = this.cachedAccessToken;
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
    };
    return this.enqueuePut(request, deviceId);
  }

  async getVisitorHistory(): Promise<Visitor[]> {
    return this.executeWithRetries(async () => {
      const token = this.cachedAccessToken;
      if (!token || !this.homeId) {
        this.log.error('Cannot fetch visitor history: Not logged in or homeId is missing.');
        return [];
      }

      const createDate = this.getDateTime();
      const offset = 0;
      const hashData = this.sha512(`IHRESTAPI${this.homeId}${offset}${createDate}`);
      const response = await axios.get(`${BASE_URL}/v16/histories/${this.homeId}/video-histories`, {
        params: { createDate, hashData, offset },
        headers: { 'Authorization': `Bearer ${token}` },
      });

      return response.data.videoList || [];
    });
  }

  async getParkingHistory(): Promise<ParkingEvent[]> {
    return this.executeWithRetries(async () => {
      const token = this.cachedAccessToken;
      if (!token || !this.homeId) {
        this.log.error('Cannot fetch parking history: Not logged in or homeId is missing.');
        return [];
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${this.homeId}${createDate}`);
      const response = await axios.get(`${BASE_URL}/v18/complex/${this.homeId}/parking/inout-histories`, {
        params: { createDate, hashData },
        headers: { 'Authorization': `Bearer ${token}` },
      });

      return response.data.data || [];
    });
  }

  async getMaintenanceFee(year: number, month: number): Promise<MaintenanceFeeData | null> {
    return this.executeWithRetries(async () => {
      const token = this.cachedAccessToken;
      if (!token || !this.homeId) {
        this.log.error('Cannot fetch maintenance fee: Not logged in or homeId is missing.');
        return null;
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${this.homeId}${year}${month}${createDate}`);
      const response = await axios.get(`${BASE_URL}/v18/complex/${this.homeId}/maintenance-fee/${year}/${month}`, {
        params: { createDate, hashData },
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.data && response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }
      return null;
    });
  }

  async getThumbnailImage(visitor: Visitor): Promise<Buffer | null> {
    const request = async () => {
      const token = this.cachedAccessToken;
      if (!token) {
        this.log.error('Cannot fetch thumbnail: Not logged in.');
        return null;
      }

      if (!visitor.sttId) {
        this.log.error('Cannot fetch thumbnail: sttId is missing from visitor object.');
        return null;
      }

      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${visitor.sttId}${createDate}`);
      const thumbnailUrl = `${BASE_URL}/v16/histories/${visitor.sttId}/video-thumbnail`;
      const response = await axios.get(thumbnailUrl, {
        params: {
          createDate,
          hashData,
        },
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data, 'binary');
    };

    return this.executeWithRetries(request);
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
