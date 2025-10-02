import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class DoorlockAccessory {
  private service: Service;

  constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
  ) {
    const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
          .setCharacteristic(this.platform.Characteristic.Model, 'Doorlock')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.LockMechanism) ||
            this.accessory.addService(this.platform.Service.LockMechanism);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
          .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
          .onGet(this.getCurrentState.bind(this))
          .onSet(this.setTargetState.bind(this));
  }

  async getCurrentState(): Promise<CharacteristicValue> {
    const device = this.accessory.context.device;
    if (device.status === 0 || device.status === false) {
      return this.platform.Characteristic.LockCurrentState.UNSECURED;
    } else {
      return this.platform.Characteristic.LockCurrentState.SECURED;
    }
  }

  async setTargetState(value: CharacteristicValue) {
    const device = this.accessory.context.device;

    if (value === this.platform.Characteristic.LockTargetState.UNSECURED) {
      const success = await this.platform.shomeClient.unlockDoorlock(device.thngId, device.nickname);

      if (success) {
        this.accessory.context.device.status = 0;
        this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.platform.Characteristic.LockCurrentState.UNSECURED);
      } else {
        setTimeout(() => {
          this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
        }, 1000);
      }
    } else {
      this.platform.log.info(`Locking ${device.nickname} via the app is not supported.`);
      setTimeout(() => {
        this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
      }, 1000);
    }
  }
}
