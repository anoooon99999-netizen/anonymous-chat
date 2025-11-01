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
  try {
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
      status: 'waiting'
    };
    
    activeChats.set(chatId, chat);
    chatMessages.set(chatId, []);
    
    console.log(`🆕 Новый чат создан: ${chatId}, тема: ${theme}`);
    
    // Рассылаем всем клиентам о новом чате
    io.emit('new_chat_created', {
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: chat.participants.length,
      status: chat.status
    });

    res.json(chat);
  } catch (error) {
    console.error('❌ Ошибка создания чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение списка чатов (только ожидающие участников)
app.get('/api/chats', (req, res) => {
  const chats = Array.from(activeChats.values())
    .filter(chat => chat.status === 'waiting' && chat.participants.length < 2)
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

// Получение информации о чате
app.get('/api/chats/:chatId', (req, res) => {
  const { chatId } = req.params;
  
  if (!activeChats.has(chatId)) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  
  const chat = activeChats.get(chatId);
  res.json(chat);
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  
  // Присоединение к чату
  socket.on('join_chat', (data) => {
    const { chatId, userId, userData } = data;
    
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
      
      // Если теперь 2 участника - активируем чат и убираем из списка доступных
      if (chat.participants.length === 2) {
        chat.status = 'active';
        
        // Уведомляем всех клиентов, что чат больше не доступен для присоединения
        io.emit('chat_became_full', {
          id: chatId,
          status: 'active',
          participants_count: 2
        });
        
        console.log(`✅ Чат ${chatId} заполнен, убран из списка доступных`);
        
        // Уведомляем участников чата об активации
        io.to(chatId).emit('chat_activated', { 
          chatId,
          participants: chat.participants
        });
      } else {
        // Обновляем информацию о чате для всех (если добавился первый участник)
        io.emit('chat_updated', {
          id: chatId,
          status: 'waiting',
          participants_count: chat.participants.length
        });
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
      userData,
      participants: chat.participants
    });
    
    // Отправляем текущих онлайн пользователей
    io.to(chatId).emit('online_users', {
      chatId,
      users: chat.participants
    });
    
    console.log(`👥 User ${userId} joined chat ${chatId}, participants: ${chat.participants.length}/2`);
  });
  
  // Покидание чата
  socket.on('leave_chat', (data) => {
    const { chatId, userId, isCreator } = data;
    
    if (activeChats.has(chatId)) {
      const chat = activeChats.get(chatId);
      
      // Удаляем пользователя из участников
      const userIndex = chat.participants.indexOf(userId);
      if (userIndex > -1) {
        chat.participants.splice(userIndex, 1);
      }
      
      // Уведомляем оставшихся участников о выходе
      socket.to(chatId).emit('user_left', { 
        chatId, 
        userId,
        remainingParticipants: chat.participants.length
      });
      
      // Если участников не осталось - закрываем чат
      if (chat.participants.length === 0) {
        activeChats.delete(chatId);
        chatMessages.delete(chatId);
        io.emit('chat_closed', { chatId });
        console.log(`🗑️ Чат ${chatId} закрыт (нет участников)`);
      } else {
        // Если вышел НЕ создатель (второй участник)
        if (!isCreator && chat.participants.length === 1) {
          // Отправляем создателю уведомление о выходе участника
          const creatorId = chat.participants[0]; // оставшийся участник - создатель
          const creatorSocketId = userSockets.get(creatorId);
          
          if (creatorSocketId) {
            io.to(creatorSocketId).emit('partner_left_chat', {
              chatId,
              chatData: {
                user_gender: chat.user_gender,
                user_age: chat.user_age,
                partner_gender: chat.partner_gender,
                min_age: chat.min_age,
                max_age: chat.max_age,
                theme: chat.theme
              },
              options: ['recreate_chat', 'return_to_chats']
            });
          }
          
          // Возвращаем вышедшего участника на вкладку чатов
          const userSocketId = userSockets.get(userId);
          if (userSocketId) {
            io.to(userSocketId).emit('redirect_to_chats');
          }
          
          chat.status = 'waiting';
          
          // Делаем чат снова доступным для присоединения
          io.emit('chat_became_available', {
            id: chatId,
            status: 'waiting',
            participants_count: 1,
            user_gender: chat.user_gender,
            user_age: chat.user_age,
            partner_gender: chat.partner_gender,
            min_age: chat.min_age,
            max_age: chat.max_age,
            theme: chat.theme,
            created_at: chat.created_at
          });
          
          console.log(`🔄 Чат ${chatId} снова доступен для присоединения (вышел участник)`);
        }
        // Если вышел создатель чата
        else if (isCreator && chat.participants.length === 1) {
          // Отправляем оставшемуся участнику уведомление
          const remainingUserId = chat.participants[0];
          const remainingSocketId = userSockets.get(remainingUserId);
          
          if (remainingSocketId) {
            io.to(remainingSocketId).emit('creator_left_chat', {
              chatId,
              options: ['return_to_chats']
            });
          }
          
          // Возвращаем создателя на вкладку чатов
          const creatorSocketId = userSockets.get(userId);
          if (creatorSocketId) {
            io.to(creatorSocketId).emit('redirect_to_chats');
          }
          
          // Закрываем чат, так как создатель ушел
          activeChats.delete(chatId);
          chatMessages.delete(chatId);
          io.emit('chat_closed', { chatId });
          console.log(`🗑️ Чат ${chatId} закрыт (создатель вышел)`);
        }
        
        // Обновляем информацию о чате
        io.emit('chat_updated', {
          id: chatId,
          status: chat.status,
          participants_count: chat.participants.length
        });
      }
      
      socket.leave(chatId);
    }
  });
  
  // Создание такого же чата (повторное создание)
  socket.on('recreate_chat', (data) => {
    const { originalChatData, userId } = data;
    
    const chatId = uuidv4();
    const chat = {
      id: chatId,
      creator_id: userId,
      user_gender: originalChatData.user_gender,
      user_age: originalChatData.user_age,
      partner_gender: originalChatData.partner_gender,
      min_age: originalChatData.min_age,
      max_age: originalChatData.max_age,
      theme: originalChatData.theme,
      participants: [userId],
      created_at: new Date().toISOString(),
      status: 'waiting'
    };
    
    activeChats.set(chatId, chat);
    chatMessages.set(chatId, []);
    
    console.log(`🔄 Чат пересоздан: ${chatId}, тема: ${chat.theme}`);
    
    // Рассылаем всем клиентам о новом чате
    io.emit('new_chat_created', {
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: chat.participants.length,
      status: chat.status
    });

    // Отправляем ID нового чата пользователю
    socket.emit('chat_recreated', { newChatId: chatId });
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
      io.emit('chat_closed', { chatId });
      console.log(`🗑️  Cleaned up old chat: ${chatId}`);
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
