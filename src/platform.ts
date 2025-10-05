import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { ShomeClient, MainDevice, SubDevice, Visitor } from './shomeClient.js';
import { LightAccessory } from './accessories/lightAccessory.js';
import { VentilatorAccessory } from './accessories/ventilatorAccessory.js';
import { HeaterAccessory } from './accessories/heaterAccessory.js';
import { DoorlockAccessory } from './accessories/doorlockAccessory.js';
import { DoorbellAccessory } from './accessories/doorbellAccessory.js';

const CONTROLLABLE_MULTI_DEVICE_TYPES = ['LIGHT', 'HEATER', 'VENTILATOR'];
const SPECIAL_CONTROLLABLE_TYPES = ['DOORLOCK'];

type AccessoryHandler = LightAccessory | VentilatorAccessory | HeaterAccessory | DoorlockAccessory | DoorbellAccessory;

export class ShomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  public readonly shomeClient: ShomeClient;
  private readonly accessoryHandlers = new Map<string, AccessoryHandler>();
  private readonly pollingInterval: number;

  private pollingTimer?: NodeJS.Timeout;
  private lastCheckedTimestamp: Date = new Date();

  constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.pollingInterval = this.config.pollingInterval ?? 3000;

    if (!this.config.username || !this.config.password || !this.config.deviceId) {
      this.log.error('Missing required configuration. Please check your config.json file.');
      this.log.error('Required fields are: "username", "password", and "deviceId".');
      this.shomeClient = null!;
      return;
    }

    this.shomeClient = new ShomeClient(
      this.log,
      this.config.username,
      this.config.password,
      this.config.deviceId,
    );

    this.log.info(`Doorbell notification service is active. Baseline time: ${this.lastCheckedTimestamp.toISOString()}`);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
      if (this.pollingInterval > 0) {
        this.startPolling();
      }
    });

    this.api.on('shutdown', () => {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    if (!this.shomeClient) {
      return;
    }

    try {
      this.log.info('Discovering devices...');
      const devices = await this.shomeClient.getDeviceList();
      const foundAccessories: PlatformAccessory[] = [];

      for (const device of devices) {
        if (CONTROLLABLE_MULTI_DEVICE_TYPES.includes(device.thngModelTypeName)) {
          const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
          if (deviceInfoList) {
            for (const subDevice of deviceInfoList) {
              const uuid = this.api.hap.uuid.generate(`${device.thngId}-${subDevice.deviceId}`);
              const accessory = this.setupAccessory(device, subDevice, uuid);
              foundAccessories.push(accessory);
            }
          }
        } else if (SPECIAL_CONTROLLABLE_TYPES.includes(device.thngModelTypeName)) {
          const uuid = this.api.hap.uuid.generate(device.thngId);
          const accessory = this.setupAccessory(device, null, uuid);
          foundAccessories.push(accessory);
        }
      }

      const doorbellUUID = this.api.hap.uuid.generate('shome-doorbell-accessory');
      const doorbellDevice = { thngModelTypeName: 'DOORBELL', nickname: 'Doorbell', thngId: 'shome-doorbell' } as MainDevice;
      const doorbellAccessory = this.setupAccessory(doorbellDevice, null, doorbellUUID);
      foundAccessories.push(doorbellAccessory);

      const accessoriesToRemove = this.accessories.filter(cachedAccessory =>
        !foundAccessories.some(foundAccessory => foundAccessory.UUID === cachedAccessory.UUID),
      );

      if (accessoriesToRemove.length > 0) {
        this.log.info('Removing stale accessories:', accessoriesToRemove.map(a => a.displayName));
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
        accessoriesToRemove.forEach(acc => this.accessoryHandlers.delete(acc.UUID));
      }
      this.log.info('Device discovery finished.');
    } catch (error) {
      this.log.error('Failed to discover devices due to a network or API error.');
    }
  }

  setupAccessory(mainDevice: MainDevice, subDevice: SubDevice | null, uuid: string): PlatformAccessory {
    const displayName = subDevice ? subDevice.nickname : mainDevice.nickname;
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    const accessory = existingAccessory ?? new this.api.platformAccessory(displayName, uuid);
    accessory.context.device = mainDevice;
    accessory.context.subDevice = subDevice;

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', displayName);
    } else {
      this.log.info('Adding new accessory:', displayName);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.createAccessoryHandler(accessory);
    return accessory;
  }

  createAccessoryHandler(accessory: PlatformAccessory) {
    const device = accessory.context.device;
    const accessoryType = device.thngModelTypeName;

    if (this.accessoryHandlers.has(accessory.UUID)) {
      return;
    }

    if (accessory.context.subDevice) {
      switch (device.thngModelTypeName) {
      case 'LIGHT':
        this.accessoryHandlers.set(accessory.UUID, new LightAccessory(this, accessory));
        break;
      case 'VENTILATOR':
        this.accessoryHandlers.set(accessory.UUID, new VentilatorAccessory(this, accessory));
        break;
      case 'HEATER':
        this.accessoryHandlers.set(accessory.UUID, new HeaterAccessory(this, accessory));
        break;
      }
      return;
    }

    switch (accessoryType) {
    case 'DOORLOCK':
      this.accessoryHandlers.set(accessory.UUID, new DoorlockAccessory(this, accessory));
      break;
    case 'DOORBELL':
      this.accessoryHandlers.set(accessory.UUID, new DoorbellAccessory(this, accessory));
      break;
    }
  }

  startPolling() {
    this.log.info(`Starting periodic state polling every ${this.pollingInterval / 1000} seconds.`);
    this.pollingTimer = setInterval(async () => {
      this.log.debug('Polling for updates...');
      try {
        await this.pollDeviceUpdates();
        await this.checkForNewVisitors();
      } catch (error) {
        this.log.error('An error occurred during polling:', error);
      }
    }, this.pollingInterval);
  }

  async pollDeviceUpdates() {
    const devices = await this.shomeClient.getDeviceList();
    for (const device of devices) {
      if (CONTROLLABLE_MULTI_DEVICE_TYPES.includes(device.thngModelTypeName)) {
        const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
        if (deviceInfoList) {
          for (const subDevice of deviceInfoList) {
            const deviceId = `${device.thngId}-${subDevice.deviceId}`;
            if (this.shomeClient.isDeviceBusy(deviceId)) {
              this.log.debug(`Skipping polling update for ${subDevice.nickname} as it has a pending request.`);
              continue;
            }
            const subUuid = this.api.hap.uuid.generate(deviceId);
            const handler = this.accessoryHandlers.get(subUuid) as LightAccessory | HeaterAccessory | VentilatorAccessory;
            if (handler) {
              handler.updateState(subDevice);
            }
          }
        }
      } else if (SPECIAL_CONTROLLABLE_TYPES.includes(device.thngModelTypeName)) {
        const deviceId = device.thngId;
        if (this.shomeClient.isDeviceBusy(deviceId)) {
          this.log.debug(`Skipping polling update for ${device.nickname} as it has a pending request.`);
          continue;
        }
        const uuid = this.api.hap.uuid.generate(deviceId);
        const handler = this.accessoryHandlers.get(uuid) as DoorlockAccessory;
        if (handler) {
          handler.updateState(device);
        }
      }
    }
  }

  async checkForNewVisitors() {
    this.log.debug('Checking for new doorbell events...');
    const visitorList = await this.shomeClient.getVisitorHistory();
    const newVisitors: Visitor[] = [];

    for (const visitor of visitorList) {
      const visitorTime = this.parseRecodDt(visitor.recodDt);
      if (visitorTime > this.lastCheckedTimestamp) {
        newVisitors.push(visitor);
      }
    }

    if (newVisitors.length > 0) {
      this.log.info(`Found ${newVisitors.length} new doorbell event(s).`);
      newVisitors.sort((a, b) => a.recodDt.localeCompare(b.recodDt));

      const doorbellUUID = this.api.hap.uuid.generate('shome-doorbell-accessory');
      const doorbellHandler = this.accessoryHandlers.get(doorbellUUID) as DoorbellAccessory | undefined;

      if (doorbellHandler) {
        for (const visitor of newVisitors) {
          doorbellHandler.ring(visitor.deviceLabel);
        }
      } else {
        this.log.warn('Doorbell accessory handler not found.');
      }

      const latestVisitor = newVisitors[newVisitors.length - 1];
      this.lastCheckedTimestamp = this.parseRecodDt(latestVisitor.recodDt);
      this.log.debug(`Updated last checked timestamp to: ${this.lastCheckedTimestamp.toISOString()}`);
    }
  }

  private parseRecodDt(recodDt: string): Date {
    const year = parseInt(recodDt.substring(0, 4), 10);
    const month = parseInt(recodDt.substring(4, 6), 10) - 1;
    const day = parseInt(recodDt.substring(6, 8), 10);
    const hour = parseInt(recodDt.substring(8, 10), 10);
    const minute = parseInt(recodDt.substring(10, 12), 10);
    const second = parseInt(recodDt.substring(12, 14), 10);
    return new Date(year, month, day, hour, minute, second);
  }
}
