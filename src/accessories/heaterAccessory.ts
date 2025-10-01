import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class HeaterAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Heater')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
            this.accessory.addService(this.platform.Service.HeaterCooler);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.setActive.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
            .onSet(this.setTargetState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
            .setProps({ minValue: 5, maxValue: 40, minStep: 1 })
            .onSet(this.setTemperature.bind(this));
    }

    async setActive(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const state = value === this.platform.Characteristic.Active.ACTIVE ? 'ON' : 'OFF';
        await this.platform.shomeClient.setDevice(device.thngId, '1', 'HEATER', 'ON_OFF', state);
    }

    async setTargetState(value: CharacteristicValue) {
        // This API seems to only support heating
        if (value !== this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
            this.platform.log.warn(`${this.accessory.displayName} only supports heating.`);
            // Optionally reset to HEAT if another state is selected
            setTimeout(() => {
                this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.platform.Characteristic.TargetHeaterCoolerState.HEAT);
            }, 100);
        }
    }

    async setTemperature(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        await this.platform.shomeClient.setDevice(device.thngId, '1', 'HEATER', 'TEMPERATURE', value.toString());
    }
}
