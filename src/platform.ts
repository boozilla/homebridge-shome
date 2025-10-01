import {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service
} from 'homebridge';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings.js';
import {ShomeClient} from './shomeClient.js';
import {LightAccessory} from './accessories/lightAccessory.js';
import {VentilatorAccessory} from './accessories/ventilatorAccessory.js';
import {HeaterAccessory} from './accessories/heaterAccessory.js';
import {DoorlockAccessory} from './accessories/doorlockAccessory.js';
import {GasValveAccessory} from './accessories/gasValveAccessory.js';
import {MotionSensorAccessory} from './accessories/motionSensorAccessory.js';
import {WindowSensorAccessory} from './accessories/windowSensorAccessory.js';
import {SosButtonAccessory} from './accessories/sosButtonAccessory.js';

// 제어 가능하며, 하위 장치 목록을 가지는 유형
const CONTROLLABLE_MULTI_DEVICE_TYPES = ['LIGHT', 'HEATER', 'VENTILATOR'];
// 제어는 불가능하지만, 센서로 노출할 장치 유형
const DISPLAYABLE_SENSOR_TYPES = ['DOORLOCK', 'WIRED GAS VALVE', 'WIRED MOTION SENSOR', 'WIRED WINDOW SENSOR', 'SOS BUTTON'];


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
            if (CONTROLLABLE_MULTI_DEVICE_TYPES.includes(device.thngModelTypeName)) {
                const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);

                if (deviceInfoList) {
                    for (const subDevice of deviceInfoList) {
                        const uuid = this.api.hap.uuid.generate(`${device.thngId}-${subDevice.deviceId}`);
                        const accessory = this.setupAccessory(device, subDevice, uuid);
                        foundAccessories.push(accessory);
                    }
                }
            } else if (DISPLAYABLE_SENSOR_TYPES.includes(device.thngModelTypeName)) {
                const uuid = this.api.hap.uuid.generate(device.thngId);
                const accessory = this.setupAccessory(device, null, uuid);
                foundAccessories.push(accessory);
            } else {
                this.log.info(`Ignoring device: ${device.nickname} (Type: ${device.thngModelTypeName})`);
            }
        }

        const accessoriesToRemove = this.accessories.filter(cachedAccessory =>
            !foundAccessories.some(foundAccessory => foundAccessory.UUID === cachedAccessory.UUID)
        );
        if (accessoriesToRemove.length > 0) {
            this.log.info('Removing stale accessories:', accessoriesToRemove.map(a => a.displayName));
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
        }
    }

    setupAccessory(mainDevice: any, subDevice: any | null, uuid: string): PlatformAccessory {
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
            // HSP 및 기타 미지원 장치는 case가 없으므로 아무것도 생성하지 않음
        }
    }
}
