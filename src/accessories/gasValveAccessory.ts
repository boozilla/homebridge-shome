import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

export class GasValveAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Gas Valve')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.Valve) ||
            this.accessory.addService(this.platform.Service.Valve);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);
        this.service.setCharacteristic(this.platform.Characteristic.ValveType, this.platform.Characteristic.ValveType.GENERIC_VALVE);

        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(this.getActive.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.InUse)
            .onGet(this.getInUse.bind(this));
    }

    async getActive(): Promise<CharacteristicValue> {
        const device = this.accessory.context.device;
        return device.status ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE;
    }

    async getInUse(): Promise<CharacteristicValue> {
        const device = this.accessory.context.device;
        return device.status ? this.platform.Characteristic.InUse.IN_USE : this.platform.Characteristic.InUse.NOT_IN_USE;
    }
}
