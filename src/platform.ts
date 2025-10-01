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
import {UnknownAccessory} from './accessories/unknownAccessory.js';
import {GasValveAccessory} from './accessories/gasValveAccessory.js';
import {MotionSensorAccessory} from './accessories/motionSensorAccessory.js';
import {WindowSensorAccessory} from './accessories/windowSensorAccessory.js';
import {SosButtonAccessory} from './accessories/sosButtonAccessory.js';


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
            const uuid = this.api.hap.uuid.generate(device.thngId);
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
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
        accessory.context.device = device;
        switch (device.thngModelTypeName) { // Note: using the original type name from API
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
