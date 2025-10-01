import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

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
            .onGet(this.getState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
            .onSet(this.setState.bind(this));
    }

    async getState(): Promise<CharacteristicValue> {
        // The API does not provide a way to get the current lock state.
        // We assume it's always secured unless just unlocked.
        return this.platform.Characteristic.LockCurrentState.SECURED;
    }

    async setState(value: CharacteristicValue) {
        const device = this.accessory.context.device;
        if (value === this.platform.Characteristic.LockTargetState.UNSECURED) {
            await this.platform.shomeClient.unlockDoorlock(device.thngId);

            // Since we can't get the state, we simulate the lock relocking after 5 seconds.
            setTimeout(() => {
                this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.platform.Characteristic.LockCurrentState.SECURED);
                this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
            }, 5000);

        }
    }
}
