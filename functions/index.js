const admin = require('firebase-admin');
const functions = require('firebase-functions');

// Ensure you initialize admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

// 🔥 TRIGGER: When a new user signs up, create their Firestore profile
exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
  const userId = user.uid;
  const userData = {
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
    photoURL: user.photoURL || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    usage: {
      promptsUsed: 0,
      lastResetDate: new Date().toISOString().split('T')[0] // YYYY-MM-DD
    },
    subscription: {
      plan: 'free',      // Default plan
      status: 'active'   // Active status
    }
  };

  // Save to Firestore

  // 🔥 TRIGGER: When a new user signs up, create their Firestore profile
exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
  const userId = user.uid;
  const userData = {
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
    photoURL: user.photoURL || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    usage: {
      promptsUsed: 0,
      lastResetDate: new Date().toISOString().split('T')[0]
    },
    subscription: {
      plan: 'free',
      status: 'active'
    }
  };

  await admin.firestore().collection('users').doc(userId).set(userData);
  console.log(`✅ User profile created for ${user.email} (UID: ${userId}) with FREE plan.`);
});
  await admin.firestore().collection('users').doc(userId).set(userData);
  console.log(`✅ User profile created for ${user.email} (UID: ${userId}) with FREE plan.`);
});

// 📦 (Optional) On user delete, clean up their data
exports.cleanupUserData = functions.auth.user().onDelete(async (user) => {
  const userId = user.uid;
  // Delete the user document and all sessions
  await admin.firestore().collection('users').doc(userId).delete();
  console.log(`🗑️ User ${userId} data cleaned up.`);
});
