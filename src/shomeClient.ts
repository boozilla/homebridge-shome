import axios from 'axios';
import CryptoJS from 'crypto-js';
import {Logger} from 'homebridge';

const BASE_URL = 'https://shome-api.samsung-ihp.com';
const APP_REGST_ID = '6110736314d9eef6baf393f3e43a5342f9ccde6ef300d878385acd9264cf14d5';
const CHINA_APP_REGST_ID = 'SHOME==6110736314d9eef6baf393f3e43a5342f9ccde6ef300d878385acd9264cf14d5';
const LANGUAGE = 'KOR';

// 응답에서 deviceInfoList의 타입을 정의합니다.
interface DeviceInfo {
  deviceId: string;

  [key: string]: any; // 다른 속성들을 포함할 수 있습니다.
}

export class ShomeClient {
  private cachedAccessToken: string | null = null;
  private ihdId: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private readonly log: Logger,
    private readonly username: string,
    private readonly password: string,
    private readonly deviceId: string,
  ) {
  }

  async login(): Promise<string | null> {
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

        // Decode token to find expiry
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
      return null;
    }
  }

  async getDeviceList(): Promise<any[]> {
    const token = await this.login();
    if (!token || !this.ihdId) {
      return [];
    }

    try {
      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${this.ihdId}${createDate}`);

      const response = await axios.get(`${BASE_URL}/v16/settings/${this.ihdId}/devices/`, {
        params: {createDate, hashData},
        headers: {'Authorization': `Bearer ${token}`},
      });

      return response.data.deviceList || [];
    } catch (error) {
      this.log.error(`Error getting device list: ${error}`);
      return [];
    }
  }

  async getDeviceInfo(thingId: string, type: string): Promise<DeviceInfo[] | null> {
    const token = await this.login();
    if (!token) {
      return null;
    }

    try {
      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${thingId}${createDate}`);
      const typePath = type.toLowerCase().replace(/_/g, '');

      const response = await axios.get(`${BASE_URL}/v18/settings/${typePath}/${thingId}`, {
        params: {createDate, hashData},
        headers: {'Authorization': `Bearer ${token}`},
      });

      return response.data.deviceInfoList || null;
    } catch (error) {
      this.log.error(`Error getting device info for ${thingId}: ${error}`);
      return null;
    }
  }

  async setDevice(thingId: string, deviceId: string, type: string, controlType: string, state: string): Promise<boolean> {
    const token = await this.login();
    if (!token) {
      return false;
    }

    try {
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
        headers: {'Authorization': `Bearer ${token}`},
      });

      this.log.info(`Set ${type} [${thingId}/${deviceId}] to ${state}`);
      return true;
    } catch (error) {
      this.log.error(`Error setting device ${thingId}: ${error}`);
      return false;
    }
  }

  async unlockDoorlock(thingId: string): Promise<boolean> {
    const token = await this.login();
    if (!token) {
      return false;
    }

    try {
      const createDate = this.getDateTime();
      const hashData = this.sha512(`IHRESTAPI${thingId}${createDate}`);

      await axios.put(`${BASE_URL}/v16/settings/doorlocks/${thingId}/open-mode`, null, {
        params: {
          createDate,
          pin: '',
          hashData,
        },
        headers: {'Authorization': `Bearer ${token}`},
      });

      this.log.info(`Unlocked doorlock [${thingId}]`);
      return true;
    } catch (error) {
      this.log.error(`Error unlocking doorlock ${thingId}: ${error}`);
      return false;
    }
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
