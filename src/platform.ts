import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { ShomeClient, MainDevice, SubDevice } from './shomeClient.js';
import { LightAccessory } from './accessories/lightAccessory.js';
import { VentilatorAccessory } from './accessories/ventilatorAccessory.js';
import { HeaterAccessory } from './accessories/heaterAccessory.js';
import { DoorlockAccessory } from './accessories/doorlockAccessory.js';

const CONTROLLABLE_MULTI_DEVICE_TYPES = ['LIGHT', 'HEATER', 'VENTILATOR'];
const SPECIAL_CONTROLLABLE_TYPES = ['DOORLOCK'];

export class ShomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  public readonly shomeClient: ShomeClient;

  constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // 1. Validate configuration
    if (!this.config.username || !this.config.password || !this.config.deviceId) {
      this.log.error('Missing required configuration. Please check your config.json file.');
      this.log.error('Required fields are: "username", "password", and "deviceId".');
      // Prevent further initialization by not creating the client
      this.shomeClient = null!;
      return;
    }

    this.shomeClient = new ShomeClient(
      this.log,
      this.config.username,
      this.config.password,
      this.config.deviceId,
    );

    this.api.on('didFinishLaunching', () => {
      // Defer device discovery until Homebridge is fully launched.
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    // Gracefully handle cases where the client was not initialized due to config errors
    if (!this.shomeClient) {
      return;
    }

    try {
      const devices = await this.shomeClient.getDeviceList();
      const foundAccessories: PlatformAccessory[] = [];

      if (!devices || devices.length === 0) {
        this.log.warn('No devices found on your sHome account. Please check your account or network connection.');
      }

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
        } else {
          this.log.info(`Ignoring device: ${device.nickname} (Type: ${device.thngModelTypeName})`);
        }
      }

      const accessoriesToRemove = this.accessories.filter(cachedAccessory =>
        !foundAccessories.some(foundAccessory => foundAccessory.UUID === cachedAccessory.UUID),
      );

      if (accessoriesToRemove.length > 0) {
        this.log.info('Removing stale accessories:', accessoriesToRemove.map(a => a.displayName));
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
      }
    } catch (error) {
      this.log.error('Failed to discover devices due to a network or API error.');
      this.log.error('Please check your network connection and sHome credentials. The plugin will not be able to control devices.');
    }
  }

  setupAccessory(mainDevice: MainDevice, subDevice: SubDevice | null, uuid: string): PlatformAccessory {
    const displayName = subDevice ? subDevice.nickname : mainDevice.nickname;
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', displayName);
      existingAccessory.context.device = mainDevice;
      existingAccessory.context.subDevice = subDevice;
      this.createAccessory(existingAccessory);
      return existingAccessory;
    } else {
      this.log.info('Adding new accessory:', displayName);
      const accessory = new this.api.platformAccessory(displayName, uuid);
      accessory.context.device = mainDevice;
      accessory.context.subDevice = subDevice;
      this.createAccessory(accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      return accessory;
    }
  }

  createAccessory(accessory: PlatformAccessory) {
    const device = accessory.context.device;
    switch (device.thngModelTypeName) {
    case 'LIGHT':
      new LightAccessory(this, accessory);
      break;
    case 'VENTILATOR':
      new VentilatorAccessory(this, accessory);
      break;
    case 'HEATER':
      new HeaterAccessory(this, accessory);
      break;
    case 'DOORLOCK':
      new DoorlockAccessory(this, accessory);
      break;
    }
  }
}
