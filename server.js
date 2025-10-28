const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Хранилище данных
let activeChats = new Map(); // chatId -> chat data
let userSockets = new Map(); // userId -> socketId
let chatMessages = new Map(); // chatId -> messages array

// Создание нового чата
app.post('/api/chats', (req, res) => {
  const { user_id, user_gender, user_age, partner_gender, min_age, max_age, theme } = req.body;
  
  const chatId = uuidv4();
  const chat = {
    id: chatId,
    creator_id: user_id,
    user_gender,
    user_age: parseInt(user_age),
    partner_gender,
    min_age: parseInt(min_age),
    max_age: parseInt(max_age),
    theme,
    participants: [user_id],
    created_at: new Date().toISOString(),
    status: 'waiting' // waiting, active, closed
  };
  
  activeChats.set(chatId, chat);
  chatMessages.set(chatId, []);
  
  console.log(`🆕 New chat created: ${chatId} by ${user_id}`);
  
  res.json(chat);
});

// Получение списка чатов
app.get('/api/chats', (req, res) => {
  const chats = Array.from(activeChats.values())
    .filter(chat => chat.status === 'waiting')
    .map(chat => ({
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: chat.participants.length
    }));
  
  res.json(chats);
});

// Отправка сообщения
app.post('/api/messages', (req, res) => {
  const { chat_id, user_id, message, user_name } = req.body;
  
  if (!activeChats.has(chat_id)) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  
  const chat = activeChats.get(chat_id);
  if (!chat.participants.includes(user_id)) {
    return res.status(403).json({ error: 'Not a participant' });
  }
  
  const messageObj = {
    id: uuidv4(),
    chat_id,
    user_id,
    user_name,
    message,
    created_at: new Date().toISOString()
  };
  
  const messages = chatMessages.get(chat_id) || [];
  messages.push(messageObj);
  chatMessages.set(chat_id, messages);
  
  // Отправляем сообщение через WebSocket
  io.to(chat_id).emit('new_message', messageObj);
  
  res.json(messageObj);
});

// Получение сообщений чата
app.get('/api/messages', (req, res) => {
  const { chat_id } = req.query;
  
  if (!chatMessages.has(chat_id)) {
    return res.json([]);
  }
  
  const messages = chatMessages.get(chat_id);
  res.json(messages);
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  
  // Присоединение к чату
  socket.on('join_chat', (data) => {
    const { chatId, userId } = data;
    
    if (!activeChats.has(chatId)) {
      socket.emit('error', { message: 'Chat not found' });
      return;
    }
    
    const chat = activeChats.get(chatId);
    
    // Проверяем можно ли присоединиться
    if (chat.participants.length >= 2 && !chat.participants.includes(userId)) {
      socket.emit('error', { message: 'Chat is full' });
      return;
    }
    
    // Добавляем пользователя если его нет
    if (!chat.participants.includes(userId)) {
      chat.participants.push(userId);
      
      // Если теперь 2 участника - активируем чат
      if (chat.participants.length === 2) {
        chat.status = 'active';
        io.to(chatId).emit('chat_activated', { chatId });
      }
    }
    
    // Сохраняем связь пользователь -> сокет
    userSockets.set(userId, socket.id);
    
    // Присоединяем сокет к комнате чата
    socket.join(chatId);
    
    // Уведомляем о новом участнике
    socket.to(chatId).emit('user_joined', {
      chatId,
      userId,
      participants: chat.participants
    });
    
    // Отправляем текущих онлайн пользователей
    io.to(chatId).emit('online_users', {
      chatId,
      users: chat.participants
    });
    
    console.log(`👥 User ${userId} joined chat ${chatId}`);
  });
  
  // Покидание чата
  socket.on('leave_chat', (data) => {
    const { chatId, userId } = data;
    
    if (activeChats.has(chatId)) {
      socket.leave(chatId);
      socket.to(chatId).emit('user_left', { chatId, userId });
    }
  });
  
  // Индикатор печати
  socket.on('typing_start', (data) => {
    const { chatId, userId } = data;
    socket.to(chatId).emit('typing_start', { chatId, userId });
  });
  
  socket.on('typing_stop', (data) => {
    const { chatId, userId } = data;
    socket.to(chatId).emit('typing_stop', { chatId, userId });
  });
  
  // Обработка отключения
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    // Находим и удаляем отключенного пользователя
    for (let [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
  });
});

// Очистка старых чатов каждые 10 минут
setInterval(() => {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  for (let [chatId, chat] of activeChats.entries()) {
    const chatTime = new Date(chat.created_at).getTime();
    
    if (chatTime < hourAgo) {
      activeChats.delete(chatId);
      chatMessages.delete(chatId);
      console.log(`🗑️  Cleaned up old chat: ${chatId}`);
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Хранилище чатов
const chats = [
    { id: 1, name: "Общий чат", userCount: 5 },
    { id: 2, name: "Флудилка", userCount: 3 },
    { id: 3, name: "Техподдержка", userCount: 2 },
    { id: 4, name: "Игры", userCount: 7 },
    { id: 5, name: "Музыка", userCount: 4 }
];

const messages = {};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница чата
app.get('/chat/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// ДОБАВЬТЕ ЭТОТ ЭНДПОИНТ ДЛЯ АВТООБНОВЛЕНИЯ
app.get('/api/chats', (req, res) => {
    res.json(chats);
});

// WebSocket соединения
io.on('connection', (socket) => {
    console.log('Новый пользователь подключен');

    socket.on('join-chat', (data) => {
        socket.join(`chat-${data.chatId}`);
        socket.to(`chat-${data.chatId}`).emit('user-joined', {
            username: data.username
        });
    });

    socket.on('send-message', (data) => {
        const { chatId, username, message } = data;
        
        if (!messages[chatId]) {
            messages[chatId] = [];
        }

        const messageData = {
            username,
            message,
            timestamp: new Date().toLocaleTimeString()
        };

        messages[chatId].push(messageData);
        
        // Отправляем сообщение всем в чате
        io.to(`chat-${chatId}`).emit('new-message', messageData);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключен');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
