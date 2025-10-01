import {PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

export class SosButtonAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'SOS Button')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.MotionSensor) ||
            this.accessory.addService(this.platform.Service.MotionSensor);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.service.getCharacteristic(this.platform.Characteristic.MotionDetected)
            .onGet(() => {
                const device = this.accessory.context.device;
                return device.status;
            });
    }
}
