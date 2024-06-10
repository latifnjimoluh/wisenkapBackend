const { Expo } = require('expo-server-sdk');
let expo = new Expo();

const sendPushNotification = async (targetExpoPushToken, message) => {
  if (!Expo.isExpoPushToken(targetExpoPushToken)) {
    console.error(`Push token ${targetExpoPushToken} is not a valid Expo push token`);
    return;
  }

  let messages = [{
    to: targetExpoPushToken,
    sound: 'default',
    body: message,
    data: { message }
  }];

  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];
  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error(error);
    }
  }
};

module.exports = { sendPushNotification };
