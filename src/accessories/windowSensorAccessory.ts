import {PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

export class WindowSensorAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Window Sensor')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.ContactSensor) ||
            this.accessory.addService(this.platform.Service.ContactSensor);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        // You'll need a way to get the state from the device.
        // For now, it will just be closed.
        this.service.getCharacteristic(this.platform.Characteristic.ContactSensorState)
            .onGet(() => {
                const device = this.accessory.context.device;
                return device.status ?
                    this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED :
                    this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
            });
    }
}
