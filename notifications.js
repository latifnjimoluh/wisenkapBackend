const admin = require('./firebaseAdmin');

const sendNotification = (token, title, body) => {
  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: token,
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log('Notification envoyée:', response);
    })
    .catch((error) => {
      console.error('Erreur lors de l\'envoi de la notification:', error);
    });
};

module.exports = {
  sendNotification,
};
