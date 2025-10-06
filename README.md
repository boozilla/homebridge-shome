# Homebridge sHome

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

`homebridge-shome` is a [Homebridge](https://homebridge.io/) plugin that allows you to integrate devices from the
Samsung Smart Home (sHome) platform into Apple HomeKit.

With this plugin, you can control devices connected to Samsung sHome, such as lights, heating, ventilation systems, and
door locks, using the Home app and Siri on your Apple devices.

## Key Features

Of course. Here is the updated `## Key Features` section for your `README.md` file in English.

---

### ## Key Features

* **Light Control**: Turn individual lights in each room on or off.
* **Heating Control**: Control thermostats in each room individually. Monitor the current temperature and set your desired target temperature.
* **Ventilation System Control**: Turn the ventilation system on or off and adjust its fan speed.
* **Digital Door Lock**: Check the current state of your door lock (locked/unlocked) and unlock it remotely.
* **Visitor Notifications**: Automatically creates a "Visitor Alert" motion sensor in HomeKit. When a new visitor is detected, this sensor is triggered, sending a notification to your Apple devices (if you have notifications enabled for the sensor in the Home app).
* **Parking Notifications**: Triggers a "Parking Activity" motion sensor when a vehicle enters or exits the parking lot, allowing you to receive notifications and create automations based on arrivals and departures.
* **Maintenance Fee Alerts**: Get notified via a "Maintenance Fee Update" motion sensor as soon as your new monthly maintenance fee statement is available. The plugin features an optimized polling logic to check for updates efficiently.

## Installation

If you have a running Homebridge setup, install the plugin using the following command:

```sh
npm install -g @boozilla/homebridge-shome
```

## Configuration

Add a new platform to the `platforms` array in your Homebridge `config.json` file.

```json
{
  "platforms": [
    {
      "platform": "sHome",
      "name": "sHome",
      "username": "YOUR_SHOME_USERNAME",
      "password": "YOUR_SHOME_PASSWORD",
      "deviceId": "YOUR_MOBILE_DEVICE_ID",
      "pollingInterval": 3000
    }
  ]
}
```

### Configuration Fields

| Key               | Description                                                                                                   | Required |
|:------------------|:--------------------------------------------------------------------------------------------------------------|:---------|
| `platform`        | Must be set to **"sHome"**.                                                                                   | Yes      |
| `name`            | The name of the platform that will appear in the Homebridge logs (e.g., "sHome").                             | Yes      |
| `username`        | Your Samsung sHome account username.                                                                          | Yes      |
| `password`        | Your Samsung sHome account password.                                                                          | Yes      |
| `deviceId`        | The unique ID of the mobile device where the sHome app is installed. This is required for API authentication. | Yes      |
| `pollingInterval` | The interval in milliseconds to poll for device status updates. Set to 0 to disable.                          | No       |

**Note:** The `deviceId` can often be found by inspecting the sHome app's internal storage or by using specific tools to
retrieve it. A correct value is essential for the API login to succeed.

## Disclaimer

This plugin is not officially developed, endorsed, or supported by Samsung. It is a personal project that relies on an
unofficial API. The API may change at any time without notice, which could cause this plugin to stop working. Use at
your own risk.

## License

This project is licensed under the MIT License.
