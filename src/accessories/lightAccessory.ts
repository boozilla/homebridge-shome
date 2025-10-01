import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class LightAccessory {
  private service: Service;

  constructor(
    private readonly platform: ShomePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const device = this.accessory.context.device;
    const subDevice = this.accessory.context.subDevice;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
      .setCharacteristic(this.platform.Characteristic.Model, 'Smart Light')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${device.thngId}-${subDevice.deviceId}`);

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    this.service.setCharacteristic(this.platform.Characteristic.Name, subDevice.nickname);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));
  }

  async getOn(): Promise<CharacteristicValue> {
    const subDevice = this.accessory.context.subDevice;
    return subDevice.deviceStatus === 1;
  }

  async setOn(value: CharacteristicValue) {
    const device = this.accessory.context.device;
    const subDevice = this.accessory.context.subDevice;

    const state = value ? 'ON' : 'OFF';
    await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'LIGHT', 'ON_OFF', state);
  }
}
