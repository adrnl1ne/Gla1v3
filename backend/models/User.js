// User Model
const bcrypt = require('bcrypt');
const { config } = require('../config/env');

// In-memory storage (will be replaced with DB)
const users = new Map();

class UserModel {
  static async create(userData) {
    const passwordHash = await bcrypt.hash(userData.password, config.saltRounds);
    
    const user = {
      userId: userData.userId || userData.username,
      username: userData.username,
      passwordHash,
      role: userData.role || 'operator',
      createdAt: new Date().toISOString()
    };
    
    users.set(user.userId, user);
    return user;
  }
  
  static async findByUsername(username) {
    for (const user of users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }
  
  static async findById(userId) {
    return users.get(userId);
  }
  
  static async verifyPassword(user, password) {
    return await bcrypt.compare(password, user.passwordHash);
  }
  
  static getAll() {
    return Array.from(users.values()).map(({ passwordHash, ...user }) => user);
  }
  
  static getStore() {
    return users;
  }
}

module.exports = UserModel;
