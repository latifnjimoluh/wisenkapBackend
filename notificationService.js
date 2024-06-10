const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const sendPushNotification = async (token, message) => {
  const messagePayload = {
    notification: {
      title: 'Notification',
      body: message,
    },
    token: token,
  };

  try {
    const response = await admin.messaging().send(messagePayload);
    console.log('Notification envoyée avec succès:', response);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification:', error);
  }
};

module.exports = { sendPushNotification };
