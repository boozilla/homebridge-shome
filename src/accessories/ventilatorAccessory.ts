import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
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
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.fanService.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));
  }

  async getActive(): Promise<CharacteristicValue> {
    const subDevice = this.accessory.context.subDevice;
    return subDevice.deviceStatus === 1
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  async getRotationSpeed(): Promise<CharacteristicValue> {
    const subDevice = this.accessory.context.subDevice;
    const apiSpeed = subDevice.windSpeedMode; // 1, 2, 3

    if (apiSpeed === 1) {
      return 100;
    } else if (apiSpeed === 2) {
      return 66;
    } else {
      return 33;
    }
  }

  async setActive(value: CharacteristicValue) {
    const device = this.accessory.context.device;
    const subDevice = this.accessory.context.subDevice;

    const state = value === this.platform.Characteristic.Active.ACTIVE ? 'ON' : 'OFF';
    const success = await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'VENTILATOR', 'ON_OFF', state);

    if (success) {
      this.accessory.context.subDevice.deviceStatus = value === this.platform.Characteristic.Active.ACTIVE ? 1 : 0;
    } else {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setRotationSpeed(value: CharacteristicValue) {
    const device = this.accessory.context.device;
    const subDevice = this.accessory.context.subDevice;
    const numericValue = Number(value);

    let apiSpeed = 3;
    if (numericValue > 33) {
      apiSpeed = 2;
    }
    if (numericValue > 66) {
      apiSpeed = 1;
    }

    const success = await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'VENTILATOR', 'WINDSPEED', apiSpeed.toString());

    if (success) {
      this.accessory.context.subDevice.windSpeedMode = apiSpeed;
    } else {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }
}
