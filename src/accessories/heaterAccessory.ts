import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';

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

        this.service.getCharacteristic(this.platform.Characteristic.Active)
          .onGet(this.getActive.bind(this))
          .onSet(this.setActive.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
          .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
          .setProps({
            validValues: [this.platform.Characteristic.TargetHeaterCoolerState.HEAT],
          })
          .onSet(this.setTargetState.bind(this))
          .onGet(this.getTargetState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
          .onGet(this.getCurrentTemperature.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
          .setProps({ minValue: 5, maxValue: 40, minStep: 1 })
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
    const success = await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'HEATER', 'ON_OFF', state, subDevice.nickname);

    if (success) {
      this.accessory.context.subDevice.deviceStatus = value === this.platform.Characteristic.Active.ACTIVE ? 1 : 0;
    } else {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setTargetState() {
    // This function does not require separate processing as it only accepts HEAT values due to setProps.
  }

  async setTargetTemperature(value: CharacteristicValue) {
    const device = this.accessory.context.device;
    const subDevice = this.accessory.context.subDevice;
    const success = await this.platform.shomeClient.setDevice(
      device.thngId,
      subDevice.deviceId.toString(),
      'HEATER',
      'TEMPERATURE',
      value.toString(),
      subDevice.nickname);

    if (success) {
      this.accessory.context.subDevice.setTemp = value as number;
    } else {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }
}
