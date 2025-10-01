import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { ShomeClient } from './shomeClient.js';
import { LightAccessory } from './accessories/lightAccessory.js';
import { VentilatorAccessory } from './accessories/ventilatorAccessory.js';
import { HeaterAccessory } from './accessories/heaterAccessory.js';
import { DoorlockAccessory } from './accessories/doorlockAccessory.js';
import { UnknownAccessory } from './accessories/unknownAccessory.js';
import { GasValveAccessory } from './accessories/gasValveAccessory.js';
import { MotionSensorAccessory } from './accessories/motionSensorAccessory.js';
import { WindowSensorAccessory } from './accessories/windowSensorAccessory.js';
import { SosButtonAccessory } from './accessories/sosButtonAccessory.js';

// deviceInfoList를 가지고 있는 장치 유형
const MULTI_DEVICE_TYPES = ['LIGHT', 'HEATER', 'VENTILATOR'];

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

        this.shomeClient = new ShomeClient(
            this.log,
            this.config.username,
            this.config.password,
            this.config.deviceId,
        );

        this.api.on('didFinishLaunching', () => {
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.accessories.push(accessory);
    }

    async discoverDevices() {
        const devices = await this.shomeClient.getDeviceList();
        const foundAccessories: PlatformAccessory[] = [];

        for (const device of devices) {
            if (MULTI_DEVICE_TYPES.includes(device.thngModelTypeName)) {
                const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);

                if (deviceInfoList) {
                    for (const subDevice of deviceInfoList) {
                        // 각 하위 장치에 대한 고유 UUID 생성
                        const uuid = this.api.hap.uuid.generate(`${device.thngId}-${subDevice.deviceId}`);
                        const accessory = this.setupAccessory(device, subDevice, uuid);
                        foundAccessories.push(accessory);
                    }
                }
            } else {
                // 단일 장치 처리
                const uuid = this.api.hap.uuid.generate(device.thngId);
                const accessory = this.setupAccessory(device, null, uuid);
                foundAccessories.push(accessory);
            }
        }

        // 더 이상 존재하지 않는 액세서리 제거
        const accessoriesToRemove = this.accessories.filter(cachedAccessory =>
            !foundAccessories.some(foundAccessory => foundAccessory.UUID === cachedAccessory.UUID)
        );
        if (accessoriesToRemove.length > 0) {
            this.log.info('Removing stale accessories:', accessoriesToRemove.map(a => a.displayName));
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
        }
    }

    setupAccessory(mainDevice: any, subDevice: any | null, uuid: string): PlatformAccessory {
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        const displayName = subDevice ? `${mainDevice.nickname} - ${subDevice.nickname}` : mainDevice.nickname;

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
        switch(device.thngModelTypeName) {
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
            case 'WIRED GAS VALVE':
                new GasValveAccessory(this, accessory);
                break;
            case 'WIRED MOTION SENSOR':
                new MotionSensorAccessory(this, accessory);
                break;
            case 'WIRED WINDOW SENSOR':
                new WindowSensorAccessory(this, accessory);
                break;
            case 'SOS BUTTON':
                new SosButtonAccessory(this, accessory);
                break;
            case 'HSP':
                this.log.info(`Ignoring HSP device type for "${device.nickname}"`);
                break;
            default:
                new UnknownAccessory(this, accessory);
                break;
        }
    }
}
