import { Service, PlatformAccessory } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class UnknownAccessory {
    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;

        // 지원되지 않는 장치의 전체 데이터를 로그로 출력합니다.
        this.platform.log.warn('Unsupported device detected. Full device data:', JSON.stringify(device, null, 2));
        this.platform.log.warn(`Unsupported device type: ${device.thngModelTypeName}. Creating a simple switch.`);

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Unknown Device')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        const service = this.accessory.getService(this.platform.Service.Switch) ||
            this.accessory.addService(this.platform.Service.Switch);

        service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);
    }
}
