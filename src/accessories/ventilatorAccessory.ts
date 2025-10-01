import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class VentilatorAccessory {
    private fanService: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        const subDevice = this.accessory.context.subDevice;

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Ventilator')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `${device.thngId}-${subDevice.deviceId}`);

        this.fanService = this.accessory.getService(this.platform.Service.Fanv2) ||
            this.accessory.addService(this.platform.Service.Fanv2);

        this.fanService.setCharacteristic(this.platform.Characteristic.Name, subDevice.nickname);

        this.fanService.getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.setActive.bind(this));

        this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .onSet(this.setRotationSpeed.bind(this));
    }

    async setActive(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const subDevice = this.accessory.context.subDevice;

        const state = value === this.platform.Characteristic.Active.ACTIVE ? 'ON' : 'OFF';
        await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'VENTILATOR', 'ON_OFF', state);
    }

    async setRotationSpeed(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const subDevice = this.accessory.context.subDevice;
        const numericValue = Number(value);

        let apiSpeed = 3;
        if (numericValue > 33) apiSpeed = 2;
        if (numericValue > 66) apiSpeed = 1;

        await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'VENTILATOR', 'WINDSPEED', apiSpeed.toString());
    }
}
