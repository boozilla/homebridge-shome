import { PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';
import { MaintenanceFeeData } from '../shomeClient.js';

export class MaintenanceFeeAccessory {
  private motionService: Service;

  constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
  ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'sHome')
          .setCharacteristic(this.platform.Characteristic.Model, 'Maintenance Fee Notifier')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, 'shome-maintenance-fee');

        // 알림을 위한 모션 센서 서비스
        this.motionService = this.accessory.getService(this.platform.Service.MotionSensor)
            || this.accessory.addService(this.platform.Service.MotionSensor, 'Maintenance Fee Update');
  }

  public triggerNotification(feeData: MaintenanceFeeData) {
    const totalAmount = feeData.expense_total[0]?.money ?? 0;
    const displayName = `${feeData.search_year}년 ${feeData.search_month}월 관리비`;

    this.platform.log.info(`New maintenance fee available: ${displayName} - ${totalAmount.toLocaleString()}원`);

    // 업데이트 알림을 위해 모션 센서 트리거
    this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(true);
    setTimeout(() => {
      this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(false);
    }, 2000);
  }
}
