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
    const success = await this.platform.shomeClient.setDevice(device.thngId, subDevice.deviceId.toString(), 'LIGHT', 'ON_OFF', state);

    if (success) {
      this.accessory.context.subDevice.deviceStatus = value ? 1 : 0;
      this.platform.log.info(`[${subDevice.nickname}] state set to ${state}.`);
    } else {
      this.platform.log.error(`[${subDevice.nickname}] failed to set state.`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }
}
