gatillo is spanish for trigger. It is a simple dead man switch service. The main goal for gatillo is to notify recipients in case the author is no longer around. The messages are encrypted with zero knowledge. This is done by encrypted the payload end to end. The service never stores the decryption key. Instead the recipients must obtain that key in some other way (see use cases below).

It is intended to work on personal devices, but works on the cloud too. Even though cloud provider failures are very rare you still want to protect against them because the risk of not being available is too high. A mixture of cloud + on-premise is the most robust solution. As long as there is one monitor node running with internet connectivity it will deliver the messages to recipients.

The solution consists of three sub-systems. The first one is the web app that allows to manage triggers and let's recipients recover encrypted messages. The second one is the monitor system which tracks check-in signals and sends notifications when the triggers meet their check-in threshold. The third one is a mobile native app that let's recipient's recover encrypted messages. The reason for the redundant app is that native apps don't need to be deployed and can even be pre-installed or distributed outside the cloud or OS stores.

The app is intended to be deployed to personal devices or non-cloud VPS such as personal server or office server. This makes it really simple and affordable to manage triggers while the author is still around. Just make sure you have enough nodes across multiple locations to ensure they will be around when the author is not around.

A personal device running a monitor node can send local notifications and open a browser tab to the recovery link trigger without internet connection or without the need of any third party-service. Now, you don't want to 100% rely on this, because it is not garanteed to be delivered this way.

gatillo uses sqlite and syncs to AWS S3 after every change. The reason this is ok is for simplicity since there is a very low number of read and writes for this service. It is really only indended to be managed on initial configuration, and then write to the database only once per check-in. Depending on how this is configured this can be once every month. In other words, extremly low traffic. Apps sync to each other by reading the latest snapshot from the cloud. If the cloud is unreachable then each one operates independenly. This is ok, because the only way the cloud goes offline for a long time is if the author is no longer around to fix the problem and the cloud is not available anymore. Which is the right scenario for each device to continue without cloud sync.

## Resiliency

The resiliency of gatillo comes from layers of fail-safe mechanisms. For example, recipients can use a web app, native app, and even a monitor node to recover messages. Nodes don't need to be in the cloud and can run on inexpensive hardware such as Raspberry Pi. The app can be deployed to fee tier cloud providers such as Flyio. In some cases, internet connectivity is not necessary, although this is an extreme scenario designed just in case everything else failed.

## Use cases

Use gatillo + futured to avoid sharing passwords before hand. futured provides users with a key based solely on a known indentifier and a target date (if the target date is in the past). This allows to create resilient keys that can only be accessed on a future date. There are many use cases that can be derived from this setup. including:

- combining multiple target dates to avoid brute forcing
- splitting the key across different futured namespaces with a shared target date

You can then add some instructions into the unencrypted note field such as a link to futured which wwould only be available on that target date.

If you do not want to use futured, then simply share the key with the recipients before hand.

## Getting started

The recomemnded way to run this app is via docker.
