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

// 제어 가능한 장치 유형 목록
const CONTROLLABLE_DEVICE_TYPES = ['LIGHT', 'HEATER', 'VENTILATOR'];

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

        for (const device of devices) {
            // 제어 가능한 장치인 경우, 미리 deviceInfo를 가져와서 subDeviceId를 저장합니다.
            if (CONTROLLABLE_DEVICE_TYPES.includes(device.thngModelTypeName)) {
                const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
                if (deviceInfoList && deviceInfoList.length > 0) {
                    // device 객체에 subDeviceId를 추가합니다.
                    device.subDeviceId = deviceInfoList[0].deviceId;
                } else {
                    this.log.warn(`Could not retrieve sub-device ID for ${device.nickname}. Control might fail.`);
                }
            }

            const uuid = this.api.hap.uuid.generate(device.thngId);
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                // 캐시된 액세서리의 context도 최신 device 정보로 업데이트합니다.
                existingAccessory.context.device = device;
                this.createAccessory(existingAccessory, device);
            } else {
                this.log.info('Adding new accessory:', device.nickname);
                const accessory = new this.api.platformAccessory(device.nickname, uuid);
                accessory.context.device = device;
                this.createAccessory(accessory, device);
                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }
    }

    createAccessory(accessory: PlatformAccessory, device: any) {
        // createAccessory는 이미 context가 설정된 accessory를 받으므로 여기서 context를 다시 설정할 필요는 없습니다.
        // accessory.context.device = device;
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
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                break;
            default:
                new UnknownAccessory(this, accessory);
                break;
        }
    }
}
