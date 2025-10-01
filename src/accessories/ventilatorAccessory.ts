import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

export class VentilatorAccessory {
    private fanService: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Ventilator')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.fanService = this.accessory.getService(this.platform.Service.Fanv2) ||
            this.accessory.addService(this.platform.Service.Fanv2);

        this.fanService.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.fanService.getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.setActive.bind(this));

        this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .onSet(this.setRotationSpeed.bind(this));
    }

    async setActive(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const state = value === this.platform.Characteristic.Active.ACTIVE ? 'ON' : 'OFF';
        await this.platform.shomeClient.setDevice(device.thngId, '1', 'VENTILATOR', 'ON_OFF', state);
    }

    async setRotationSpeed(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const numericValue = Number(value);

        // sHome API uses 1,2,3 where 1 is strongest, 3 is weakest.
        // HomeKit uses percentages. Let's map it.
        // 1-33% -> speed 3 (weakest)
        // 34-66% -> speed 2 (medium)
        // 67-100% -> speed 1 (strongest)
        let apiSpeed = 3;
        if (numericValue > 33) apiSpeed = 2;
        if (numericValue > 66) apiSpeed = 1;

        await this.platform.shomeClient.setDevice(device.thngId, '1', 'VENTILATOR', 'WINDSPEED', apiSpeed.toString());
    }
}
