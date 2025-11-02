const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для онлайн работы
const io = socketIo(server, {
  cors: {
    origin: "*", // В продакшене заменить на конкретный домен
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Основной маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API маршруты
app.post('/api/chats', (req, res) => {
  try {
    const { user_id, user_gender, user_age, partner_gender, min_age, max_age, theme } = req.body;
    
    const chatId = uuidv4();
    const chat = {
      id: chatId,
      user_id: user_id,
      user_gender,
      user_age: parseInt(user_age),
      partner_gender,
      min_age: parseInt(min_age),
      max_age: parseInt(max_age),
      theme,
      participants_count: 1,
      created_at: new Date().toISOString()
    };
    
    activeChats.set(chatId, chat);
    chatMessages.set(chatId, []);
    
    console.log(`🆕 Новый чат создан: ${chatId}, создатель: ${user_id}`);
    
    io.emit('new_chat_created', chat);

    res.json({
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      participants_count: 1,
      created_at: chat.created_at,
      user_id: chat.user_id
    });
  } catch (error) {
    console.error('❌ Ошибка создания чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/chats', (req, res) => {
  const chats = Array.from(activeChats.values())
    .filter(chat => chat.participants_count === 1)
    .map(chat => ({
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: 1,
      user_id: chat.user_id
    }));
  
  console.log(`📋 Запрос списка чатов: найдено ${chats.length} активных чатов`);
  res.json(chats);
});

app.post('/api/messages', (req, res) => {
  const { chat_id, user_id, message } = req.body;
  
  const activeChat = activeChats.get(chat_id);
  const activeConnection = activeConnections.get(chat_id);
  
  if (!activeChat && !activeConnection) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  
  const messageObj = {
    id: uuidv4(),
    chat_id,
    user_id,
    message,
    created_at: new Date().toISOString()
  };
  
  const messages = chatMessages.get(chat_id) || [];
  messages.push(messageObj);
  chatMessages.set(chat_id, messages);
  
  io.to(chat_id).emit('new_message', messageObj);
  
  res.json(messageObj);
});

app.get('/api/messages', (req, res) => {
  const { chat_id } = req.query;
  
  if (!chatMessages.has(chat_id)) {
    return res.json([]);
  }
  
  const messages = chatMessages.get(chat_id);
  res.json(messages);
});

// Хранилище данных в памяти
let activeChats = new Map();
let activeConnections = new Map();
let chatMessages = new Map();

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  
  socket.on('join_chat', (data) => {
    const { chatId, userId } = data;
    
    console.log(`👥 Попытка присоединения: user ${userId} к чату ${chatId}`);
    
    if (!activeChats.has(chatId)) {
      socket.emit('error', { message: 'Chat not found or already active' });
      return;
    }
    
    const chat = activeChats.get(chatId);
    
    if (chat.participants_count !== 1) {
      socket.emit('error', { message: 'Chat is already full' });
      return;
    }
    
    if (chat.user_id === userId) {
      socket.emit('error', { message: 'Cannot join your own chat' });
      return;
    }
    
    console.log(`✅ User ${userId} присоединяется к чату ${chatId}`);
    
    chat.participants_count = 2;
    
    activeChats.delete(chatId);
    activeConnections.set(chatId, {
      ...chat,
      participants: [chat.user_id, userId]
    });
    
    io.emit('chat_activated', { chatId });
    
    console.log(`🎉 Чат ${chatId} активирован! Участники: ${chat.user_id} и ${userId}`);
    
    socket.join(chatId);
    
    io.to(chatId).emit('chat_activated', { 
      chatId,
      message: 'Чат активирован! Начинайте общение.'
    });
    
    socket.to(chatId).emit('user_joined', {
      chatId,
      userId,
      participants_count: 2
    });
    
    io.to(chatId).emit('online_users', {
      chatId,
      count: 2,
      users: [chat.user_id, userId]
    });
  });
  
  socket.on('leave_chat', (data) => {
    const { chatId, userId } = data;
    
    console.log(`🚪 User ${userId} покидает чат ${chatId}`);
    
    const activeChat = activeChats.get(chatId);
    const activeConnection = activeConnections.get(chatId);
    
    if (activeConnection) {
      const chat = activeConnection;
      chat.participants_count = Math.max(0, chat.participants_count - 1);
      
      console.log(`📊 В чате ${chatId} осталось участников: ${chat.participants_count}`);
      
      socket.to(chatId).emit('user_left', { chatId, userId });
      
      const remainingUsers = chat.participants?.filter(id => id !== userId) || [];
      io.to(chatId).emit('online_users', {
        chatId,
        count: remainingUsers.length,
        users: remainingUsers
      });
      
      if (chat.participants_count === 0) {
        activeConnections.delete(chatId);
        chatMessages.delete(chatId);
        console.log(`🗑️ Чат ${chatId} полностью удален (нет участников)`);
      } else if (chat.participants_count === 1 && chat.user_id !== userId) {
        console.log(`🎯 Участник ${userId} вышел, уведомляем создателя ${chat.user_id}`);
        io.to(chatId).emit('user_left', { chatId, userId, isPartnerLeft: true });
      }
    } else if (activeChat) {
      const chat = activeChat;
      if (chat.user_id === userId) {
        activeChats.delete(chatId);
        chatMessages.delete(chatId);
        io.emit('chat_removed', { chatId });
        console.log(`🗑️ Чат ${chatId} удален (создатель вышел)`);
      }
    }
    
    socket.leave(chatId);
  });
  
  socket.on('typing_start', (data) => {
    const { chatId, userId } = data;
    socket.to(chatId).emit('typing_start', { chatId, userId });
  });
  
  socket.on('typing_stop', (data) => {
    const { chatId, userId } = data;
    socket.to(chatId).emit('typing_stop', { chatId, userId });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
  });
});

// Очистка старых чатов
setInterval(() => {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  for (let [chatId, chat] of activeChats.entries()) {
    const chatTime = new Date(chat.created_at).getTime();
    if (chatTime < hourAgo) {
      activeChats.delete(chatId);
      chatMessages.delete(chatId);
      io.emit('chat_removed', { chatId });
      console.log(`🗑️ Очищен старый чат: ${chatId}`);
    }
  }
  
  for (let [chatId, chat] of activeConnections.entries()) {
    if (chat.participants_count === 0) {
      activeConnections.delete(chatId);
      chatMessages.delete(chatId);
      console.log(`🗑️ Очищено неактивное соединение: ${chatId}`);
    }
  }
}, 10 * 60 * 1000);

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Active chats waiting: ${activeChats.size}`);
  console.log(`🔗 Active connections: ${activeConnections.size}`);
  console.log(`🌐 Access the app at: http://localhost:${PORT}`);
});
