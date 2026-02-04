gatillo is spanish for trigger. It is a simple dead man switch service. The main goal for gatillo is to notify recipients in case the author is no longer around. The messages are encrypted with zero knowledge. This is done by encrypting the payload end to end. The service never stores the decryption key. Instead the recipients must obtain that key in some other way (see use cases below).

It is intended to work on personal devices, but works on the cloud too. Even though cloud provider failures are very rare you still want to protect against them because the risk of not being available is too high. A mixture of cloud + on-premise is the most robust solution. As long as there is one monitor node running with internet connectivity it will deliver the messages to recipients.

The solution consists of three sub-systems. The first one is the web app that allows to manage triggers and let's recipients recover encrypted messages. The second one is the monitor system which tracks check-in signals and sends notifications when the triggers meet their check-in threshold. The third one is a standalone html file that gets sent along with the notification that let's recipient's recover encrypted messages offline as long as they have a browser (such as within an airgap device).

The app is intended to be deployed to personal devices or non-cloud VPS such as personal server or office server. This makes it really simple and affordable to manage triggers while the author is still around. Just make sure you have enough nodes across multiple locations to ensure they will be around when the author is not around.

## Data storage

gatillo uses sqlite and syncs to AWS S3 periodically. The reason this is ok is for simplicity since there is a very low number of read and writes for this service. It is really only indended to be managed on initial configuration, and then write to the database only once per check-in. Depending on how this is configured this can be once every month. In other words, extremly low traffic. Apps can recover from cloud in case they lose their local file. If the cloud is unreachable then each one operates independenly. This is ok, because the only way the cloud goes offline for a long time is if the author is no longer around to fix the problem and the cloud is not available anymore. Which is the right scenario for each device to continue without cloud sync.

S3 backups are per device and are not intended to sync multiple devices. Instead each device gets to work with its local file and with its corresponding S3 backup. If there is a need to initialize all devices to the same state it is possible to copy the S3 file and rename it to match the other devices backup. In the future there would be a future to do this via the app. For now just make sure to stop all devices make the copies in S3 then restart the node in all devices and making sure to delete each local file for each device.

There are plans to provide alternative backup mechanisms.

## Notifications

The system is setup to use nodemailer with SMTP to send email notifications. I'm considering adding additional communication methods, but need to find one that is reliable. You can choose to run your own email server to avoid relying on the cloud.

## Resiliency

The resiliency of gatillo comes from layers of fail-safe mechanisms. For example, recipients don't need external apps or accounts to recover the message. If they receive the email they will be able to recover thanks to the bundled HTML page attached to the email. This HTML page contains all the necessary code to decrypt the encrypted message without dependencies and without internet connectivity. Nodes don't need to be in the cloud and can run on inexpensive hardware such as Raspberry Pi. The app can be deployed to fee tier cloud providers such as Flyio. As long as there is a node with internet connectivity the message will be sent to the recipient.

## Use cases

Use gatillo + futured to avoid sharing passwords before hand. futured provides users with a key based solely on a known indentifier and a target date (if the target date is in the past). This allows to create resilient keys that can only be accessed on a future date. There are many use cases that can be derived from this setup. including:

- combining multiple target dates to avoid brute forcing
- splitting the key across different futured namespaces with a shared target date

You can then add some instructions into the unencrypted note field such as a link to futured which would only be available on that target date.

If you do not want to use futured, then simply share the key with the recipients before hand.

An alternative method is to setup the triggers and download the encrypted data and send it to your family in advance. They can store the file securely either on their own devices or the cloud. This way you don't have to worry about running a gatillo node. With this setup it is possible to configure a password manager with a family plan so that your account has the decryption password and access to the account is given only when you pass away.

## Getting started

The recomemnded way to run this app is via docker.
