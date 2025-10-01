import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

export class HeaterAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        const subDevice = this.accessory.context.subDevice;

        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Heater')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, `${device.thngId}-${subDevice.deviceId}`);

        this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
            this.accessory.addService(this.platform.Service.HeaterCooler);

        this.service.setCharacteristic(this.platform.Characteristic.Name, subDevice.nickname);

        // 현재/목표 온도 및 상태 특성 설정
        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
            .onSet(this.setTargetState.bind(this))
            .onGet(this.getTargetState.bind(this)); // 목표 상태 onGet 추가

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .onGet(this.getCurrentTemperature.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
            .setProps({minValue: 5, maxValue: 40, minStep: 1})
            .onGet(this.getTargetTemperature.bind(this))
            .onSet(this.setTargetTemperature.bind(this));
    }

    async getActive(): Promise<CharacteristicValue> {
        const subDevice = this.accessory.context.subDevice;
        return subDevice.deviceStatus === 1
            ? this.platform.Characteristic.Active.ACTIVE
            : this.platform.Characteristic.Active.INACTIVE;
    }

    async getCurrentState(): Promise<CharacteristicValue> {
        const subDevice = this.accessory.context.subDevice;
        return subDevice.deviceStatus === 1
            ? this.platform.Characteristic.CurrentHeaterCoolerState.HEATING
            : this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    async getTargetState(): Promise<CharacteristicValue> {
        // 이 API는 항상 난방만 지원하므로 HEAT를 반환합니다.
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    }

    async getCurrentTemperature(): Promise<CharacteristicValue> {
        const subDevice = this.accessory.context.subDevice;
        return subDevice.currentTemp;
    }

    async getTargetTemperature(): Promise<CharacteristicValue> {
        const subDevice = this.accessory.context.subDevice;
        return subDevice.setTemp;
    }

    async setActive(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const subDevice = this.accessory.context.subDevice;

        const state = value === this.platform.Characteristic.Active.ACTIVE ? 'ON' : 'OFF';
        await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'HEATER', 'ON_OFF', state);
    }

    async setTargetState(value: CharacteristicValue) {
        if (value !== this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
            this.platform.log.warn(`${this.accessory.displayName} only supports heating.`);
            setTimeout(() => {
                this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState, this.platform.Characteristic.TargetHeaterCoolerState.HEAT);
            }, 100);
        }
    }

    async setTargetTemperature(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        const subDevice = this.accessory.context.subDevice;

        await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'HEATER', 'TEMPERATURE', value.toString());
    }
}
