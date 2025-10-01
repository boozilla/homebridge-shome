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

        // 버그 수정: 제어 가능한 UI를 없애기 위해 OccupancySensor 서비스로 변경
        this.service = this.accessory.getService(this.platform.Service.OccupancySensor) ||
            this.accessory.addService(this.platform.Service.OccupancySensor);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.service.getCharacteristic(this.platform.Characteristic.OccupancyDetected)
            .onGet(this.getOccupancyState.bind(this));
    }

    async getOccupancyState(): Promise<CharacteristicValue> {
        const device = this.accessory.context.device;
        // status가 true (열림) 이면 점유 감지됨으로 표시
        return device.status
            ? this.platform.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
            : this.platform.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
    }
}
