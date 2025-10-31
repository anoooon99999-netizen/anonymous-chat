// Конфигурация
const API_URL = window.location.origin;
const SOCKET_URL = window.location.origin;

// Глобальные переменные
let allChats = [];
let userStats = {
    createdChats: 0,
    sentMessages: 0,
    friends: 0,
    daysActive: 1,
    reputation: 150
};
let vkUser = null;
let currentChat = null;
let isVK = false;
let currentTheme = 'Общение';
let typingTimer = null;
let onlineUsers = new Set();
let lastChatParams = null;
let socket = null;

// Инициализация приложения
async function initApp() {
    try {
        if (typeof vkBridge !== 'undefined') {
            await vkBridge.send('VKWebAppInit');
            isVK = true;
            const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
            vkUser = userInfo;
            updateUserInterface(userInfo);
            showNotification('Добро пожаловать, ' + userInfo.first_name + '!');
        } else {
            throw new Error('VK Bridge not available');
        }
    } catch (error) {
        console.log('Приложение запущено вне VK:', error.message);
        isVK = false;
        vkUser = { 
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            first_name: 'Аноним',
            last_name: ''
        };
        updateUserInterface(vkUser);
        showNotification('Анонимный режим');
    }

    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    // Автообновление каждые 5 секунд
    setInterval(() => {
        if (!currentChat) {
            loadAndRenderChats();
        }
    }, 5000);
}

function updateUserInterface(userInfo) {
    document.getElementById('vkUserName').textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    document.getElementById('vkUserInfo').style.display = 'flex';
    document.getElementById('profileName').textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    document.getElementById('currentAvatar').textContent = userInfo.first_name.charAt(0);
}

// Переключение вкладок чатов
function switchChatTab(theme) {
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('createChatText').textContent = 'Создать чат для ' + theme;
    renderChatsList();
}

function initSocket() {
    try {
        socket = io(SOCKET_URL);
        
        socket.on('connect', () => {
            console.log('✅ Подключен к серверу');
            if (currentChat) {
                socket.emit('join_chat', { chatId: currentChat.id, userId: vkUser?.id });
            }
            // Запрашиваем обновление чатов сразу после подключения
            loadAndRenderChats();
        });
        
        socket.on('new_message', (message) => {
            if (currentChat && message.chat_id === currentChat.id) {
                addMessageToChat(message);
            }
        });
        
        socket.on('user_joined', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers.add(data.userId);
                updateOnlineCount();
                showNotification('👤 Собеседник присоединился к чату');
            }
        });
        
        socket.on('user_left', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers.delete(data.userId);
                updateOnlineCount();
                showPartnerLeftModal();
            }
        });
        
        socket.on('chat_activated', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                showNotification('🎉 Чат активирован! Начинайте общение');
            }
            // Обновляем список чатов при активации
            loadAndRenderChats();
        });
        
        socket.on('typing_start', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                document.getElementById('typingIndicator').style.display = 'inline';
            }
        });
        
        socket.on('typing_stop', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                document.getElementById('typingIndicator').style.display = 'none';
            }
        });
        
        socket.on('online_users', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers = new Set(data.users);
                updateOnlineCount();
            }
        });
        
        socket.on('error', (data) => {
            showNotification('❌ ' + data.message);
        });
        
        // ВАЖНО: Обработчик нового чата (только для других пользователей)
        socket.on('new_chat_created', (chat) => {
            console.log('📨 Получен новый чат от другого пользователя:', chat);
            
            // ВАЖНО: Проверяем, что чат создан не нами
            if (chat.creator_id !== vkUser?.id) {
                const newChat = {
                    id: chat.id,
                    gender: chat.user_gender + ', ' + chat.user_age,
                    lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
                    theme: chat.theme,
                    participants_count: chat.participants_count,
                    timestamp: new Date(chat.created_at).getTime(),
                    creator_id: chat.creator_id
                };
                
                // Добавляем чат в начало списка
                allChats.unshift(newChat);
                
                console.log(`🎯 Новый чат добавлен в тему: "${chat.theme}" от пользователя ${chat.creator_id}`);
                
                // Обновляем список если тема совпадает
                if (chat.theme === currentTheme) {
                    renderChatsList();
                    showNotification('📢 Создан новый чат в разделе "' + chat.theme + '"');
                }
            } else {
                console.log('ℹ️ Это мой собственный чат, не добавляем в список');
            }
        });
        
        socket.on('chat_removed', (data) => {
            console.log('🗑️ Чат удален:', data.chatId);
            allChats = allChats.filter(chat => chat.id !== data.chatId);
            renderChatsList();
        });
        
        // ВАЖНО: Принудительное обновление чатов
        socket.on('force_refresh_chats', () => {
            console.log('🔄 Принудительное обновление чатов от сервера');
            loadAndRenderChats();
        });
        
        socket.on('server_stats', (stats) => {
            console.log('📊 Статистика сервера:', stats);
            updateOnlineCounter(stats.online_users || 0);
        });
        
    } catch (error) {
        console.error('Socket error:', error);
    }
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    document.getElementById('onlineCount').textContent = count + ' онлайн';
}

function updateOnlineCounter(count) {
    const onlineElement = document.getElementById('onlineUsersCount');
    if (onlineElement) onlineElement.textContent = count;
}

function handleTyping() {
    if (!currentChat || !socket) return;
    
    socket.emit('typing_start', { 
        chatId: currentChat.id, 
        userId: vkUser?.id 
    });
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('typing_stop', { 
            chatId: currentChat.id, 
            userId: vkUser?.id 
        });
    }, 1000);
}

// Загрузка чатов с сервера (ТОЛЬКО ЧУЖИЕ ЧАТЫ)
window.loadChatsFromServer = async function() {
    try {
        console.log('🌐 Запрос ЧУЖИХ чатов с сервера для пользователя:', vkUser?.id);
        
        // ВАЖНО: передаем ID пользователя для фильтрации
        const response = await fetch(API_URL + '/api/chats?user_id=' + (vkUser?.id || 'anonymous'));
        if (!response.ok) {
            throw new Error('HTTP error ' + response.status);
        }
        const chats = await response.json();
        console.log('📊 Получено ЧУЖИХ чатов с сервера:', chats.length);
        
        // Детальная отладка
        chats.forEach(chat => {
            console.log(`🔍 Чужой чат ${chat.id}: тема="${chat.theme}", создатель=${chat.creator_id}`);
        });
        
        return chats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime(),
            creator_id: chat.creator_id
        }));
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

// Загрузка МОИХ чатов (для создателя)
async function loadMyChats() {
    try {
        console.log('📱 Запрос МОИХ чатов с сервера для пользователя:', vkUser?.id);
        
        const response = await fetch(API_URL + '/api/my_chats?user_id=' + (vkUser?.id || 'anonymous'));
        if (!response.ok) {
            throw new Error('HTTP error ' + response.status);
        }
        const myChats = await response.json();
        console.log('📱 Получено МОИХ чатов с сервера:', myChats.length);
        
        return myChats;
    } catch (error) {
        console.error('❌ Ошибка загрузки моих чатов:', error);
        return [];
    }
}

async function loadAndRenderChats() {
    try {
        console.log('🔄 Загрузка и отображение ЧУЖИХ чатов...');
        const chats = await window.loadChatsFromServer();
        allChats = chats;
        renderChatsList();
        
        // Запрашиваем обновление у других клиентов
        if (socket) {
            socket.emit('chats_updated', { user_id: vkUser?.id });
        }
    } catch (error) {
        console.error('❌ Ошибка в loadAndRenderChats:', error);
    }
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) return;
    
    container.innerHTML = '';

    // ФИЛЬТРАЦИЯ ПО ТЕМЕ (только чужие чаты)
    const filteredChats = allChats.filter(chat => {
        const matchesTheme = chat.theme === currentTheme;
        const isNotMyChat = chat.creator_id !== vkUser?.id; // ВАЖНО: проверяем что не наш чат
        
        console.log(`🔍 Фильтр: "${chat.theme}" === "${currentTheme}": ${matchesTheme}, не мой чат: ${isNotMyChat}`);
        return matchesTheme && isNotMyChat;
    });
    
    console.log(`🎯 Отображаем ЧУЖИЕ чаты для темы "${currentTheme}":`, filteredChats.length);
    console.log('📋 Все доступные темы:', [...new Set(allChats.map(chat => chat.theme))]);

    if (filteredChats.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                <div>Чатов в разделе "${currentTheme}" пока нет</div>
                <div style="font-size: 14px; margin-top: 8px;">Создайте первый чат!</div>
            </div>
        `;
        return;
    }
    
    filteredChats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'user-card';
        chatElement.onclick = () => startChat(chat);
        
        chatElement.innerHTML = `
            <div class="user-info">
                <div class="info-row">
                    <span class="info-label">Пол:</span>
                    <span class="info-value">${chat.gender}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Ищу:</span>
                    <span class="info-value">${chat.lookingFor}</span>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="theme-tag">${chat.theme}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    ${getTimeAgo(chat.timestamp)}
                </div>
            </div>
        `;
        container.appendChild(chatElement);
    });
}

function openCreateChatModal() {
    console.log('🎯 Открываем модальное окно создания чата');
    document.getElementById('modalTitle').textContent = 'Создать чат для ' + currentTheme;
    document.getElementById('createChatModal').style.display = 'block';
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
    let minAge = parseInt(minSlider.value);
    let maxAge = parseInt(maxSlider.value);
    
    if (minAge > maxAge) {
        minAge = maxAge;
        minSlider.value = minAge;
    }
    
    document.getElementById('minAgeValue').textContent = minAge;
    document.getElementById('maxAgeValue').textContent = maxAge;
    
    document.getElementById('minAge').value = minAge;
    document.getElementById('maxAge').value = maxAge;
}

async function createChat() {
    console.log('🔍 Начинаем создание чата...');
    
    const myGenderElement = document.querySelector('#myGenderOptions .option-button.active');
    const partnerGenderElement = document.querySelector('#partnerGenderOptions .option-button.active');
    
    if (!myGenderElement || !partnerGenderElement) {
        showNotification('❌ Пожалуйста, выберите пол для себя и собеседника');
        return;
    }
    
    const myGender = myGenderElement.textContent;
    const myAge = document.getElementById('myAge').value;
    const partnerGender = partnerGenderElement.textContent;
    const minAge = document.getElementById('minAge').value;
    const maxAge = document.getElementById('maxAge').value;

    console.log('📊 Данные для создания чата:', { 
        myGender, myAge, partnerGender, minAge, maxAge, theme: currentTheme 
    });

    if (!myAge || myAge < 18 || myAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возраст (18-80)');
        return;
    }

    if (!minAge || !maxAge || minAge >= maxAge || minAge < 18 || maxAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возрастной диапазон (18-80)');
        return;
    }

    lastChatParams = {
        myGender: myGender,
        myAge: parseInt(myAge),
        partnerGender: partnerGender,
        minAge: parseInt(minAge),
        maxAge: parseInt(maxAge),
        theme: currentTheme
    };

    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: myGender,
        user_age: parseInt(myAge),
        partner_gender: partnerGender,
        min_age: parseInt(minAge),
        max_age: parseInt(maxAge),
        theme: currentTheme
    };

    console.log('📨 Отправляем данные на сервер:', chatData);

    try {
        showNotification('⏳ Создаем чат...');
        
        const response = await fetch(API_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatData)
        });
        
        console.log('📡 Статус ответа:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Чат создан успешно:', result);
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            
            showNotification('✅ Чат создан! Ожидаем собеседника...');
            closeCreateChatModal();
            
            // ВАЖНО: Уведомляем сервер о создании чата для синхронизации (другие пользователи увидят чат)
            if (socket) {
                socket.emit('new_chat_created_global');
            }
            
            // НЕ обновляем список чатов - создатель не должен видеть свой чат
            // Вместо этого сразу переходим в созданный чат
            
            // Автоматически переходим в созданный чат
            setTimeout(() => {
                const newChat = {
                    id: result.id,
                    gender: myGender + ', ' + myAge,
                    lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                    theme: currentTheme,
                    participants_count: 1,
                    timestamp: Date.now(),
                    creator_id: vkUser?.id // Отмечаем что это наш чат
                };
                startChat(newChat);
            }, 500);
            
        } else {
            const errorText = await response.text();
            console.error('❌ Ошибка сервера:', response.status, errorText);
            showNotification('❌ Ошибка создания чата');
        }
    } catch (error) {
        console.error('❌ Ошибка сети:', error);
        showNotification('❌ Ошибка сети. Проверьте подключение');
    }
}

async function startChat(chat) {
    console.log('🚀 Начинаем чат:', chat.id, 'мой чат:', chat.creator_id === vkUser?.id);
    
    currentChat = null;
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Подключаемся к чату...</div>
                ${chat.creator_id === vkUser?.id ? '<div style="font-size: 14px; margin-top: 8px;">Ожидаем подключения собеседника</div>' : ''}
            </div>
        `;
    }
    
    currentChat = chat;
    document.getElementById('chatRoomTitle').textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    showScreen('chatRoomScreen');
    
    document.body.classList.add('chat-room-active');
    
    if (socket) {
        socket.emit('join_chat', { chatId: chat.id, userId: vkUser?.id });
    }
    
    await loadMessages(chat.id);
    
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 300);
}

// Остальные функции остаются без изменений...
// [остальной код app.js остается таким же как в предыдущей версии]
