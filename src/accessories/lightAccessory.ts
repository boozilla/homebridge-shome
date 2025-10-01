import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class LightAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Smart Light')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.Lightbulb) ||
            this.accessory.addService(this.platform.Service.Lightbulb);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this));
    }

    async setOn(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const state = value ? 'ON' : 'OFF';

        const deviceInfoList = await this.platform.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
        if (deviceInfoList && deviceInfoList.length > 0) {
            const subDeviceId = deviceInfoList[0].deviceId;
            await this.platform.shomeClient.setDevice(device.thngId, subDeviceId, 'LIGHT', 'ON_OFF', state);
            this.platform.log.info(`${device.nickname} set to ${state}`);
        } else {
            this.platform.log.error(`Could not get device info for ${device.nickname}`);
        }
    }
}
