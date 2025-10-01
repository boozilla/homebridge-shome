import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ShomePlatform } from '../platform.js';

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

    private async getSubDeviceId(): Promise<string | null> {
        const device = this.accessory.context.device;
        const deviceInfoList = await this.platform.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
        if (deviceInfoList && deviceInfoList.length > 0) {
            return deviceInfoList[0].deviceId;
        }
        this.platform.log.error(`Could not get device info for ${device.nickname}`);
        return null;
    }

    async setActive(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        if (!device.subDeviceId) {
            this.platform.log.error(`No subDeviceId found for ${device.nickname}. Cannot set active state.`);
            return;
        }

        const state = value === this.platform.Characteristic.Active.ACTIVE ? 'ON' : 'OFF';
        await this.platform.shomeClient.setDevice(device.thngId, device.subDeviceId, 'VENTILATOR', 'ON_OFF', state);
    }

    async setRotationSpeed(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        if (!device.subDeviceId) {
            this.platform.log.error(`No subDeviceId found for ${device.nickname}. Cannot set rotation speed.`);
            return;
        }

        const numericValue = Number(value);
        let apiSpeed = 3;
        if (numericValue > 33) apiSpeed = 2;
        if (numericValue > 66) apiSpeed = 1;

        await this.platform.shomeClient.setDevice(device.thngId, device.subDeviceId, 'VENTILATOR', 'WINDSPEED', apiSpeed.toString());
    }
}
