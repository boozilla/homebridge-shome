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
      .onGet(this.getCurrentState.bind(this)) // Note: Using getCurrentState for onGet
      .onSet(this.setTargetState.bind(this));
  }

  async getCurrentState(): Promise<CharacteristicValue> {
    const device = this.accessory.context.device;
    return (device.status === 0 || device.status === false)
      ? this.platform.Characteristic.LockCurrentState.UNSECURED
      : this.platform.Characteristic.LockCurrentState.SECURED;
  }

  async setTargetState(value: CharacteristicValue) {
    const device = this.accessory.context.device;

    if (value === this.platform.Characteristic.LockTargetState.UNSECURED) {
      this.platform.log.info(`Unlocking ${device.nickname}...`);
      const success = await this.platform.shomeClient.unlockDoorlock(device.thngId);

      if (success) {
        this.platform.log.info(`${device.nickname} unlocked successfully.`);
        this.accessory.context.device.status = 0; // Update context to UNSECURED
        this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.platform.Characteristic.LockCurrentState.UNSECURED);
      } else {
        this.platform.log.error(`Failed to unlock ${device.nickname}.`);
        // Revert the target state in HomeKit UI after a short delay
        setTimeout(() => {
          this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
        }, 1000);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    } else {
      this.platform.log.info(`Locking ${device.nickname} via the app is not supported.`);
      this.accessory.context.device.status = 1; // Update context to SECURED
      // Revert the target state in HomeKit UI after a short delay to reflect it's locked
      setTimeout(() => {
        this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
        this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.platform.Characteristic.LockCurrentState.SECURED);
      }, 1000);
    }
  }
}
