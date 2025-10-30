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

// Инициализация приложения
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
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
        showNotification('Анонимный режим - можно создавать чаты');
    }

    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    console.log('✅ Приложение инициализировано');
}

function updateUserInterface(userInfo) {
    const userNameElement = document.getElementById('vkUserName');
    const userInfoElement = document.getElementById('vkUserInfo');
    const profileNameElement = document.getElementById('profileName');
    const currentAvatarElement = document.getElementById('currentAvatar');
    
    if (userNameElement) {
        userNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (userInfoElement) {
        userInfoElement.style.display = 'flex';
    }
    
    if (profileNameElement) {
        profileNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (currentAvatarElement) {
        currentAvatarElement.textContent = userInfo.first_name.charAt(0);
    }
}

// Переключение вкладок чатов
function switchChatTab(theme) {
    console.log('🔄 Переключение на вкладку:', theme);
    
    currentTheme = theme;
    
    // Обновляем активные вкладки
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    // Обновляем текст создания чата
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = 'Создать чат для ' + theme;
    }
    
    renderChatsList();
}

function initSocket() {
    try {
        if (!window.socket) {
            console.error('Socket.io не инициализирован');
            return;
        }
        
        window.socket.on('connect', () => {
            console.log('✅ Connected to server');
            if (currentChat) {
                window.socket.emit('join_chat', { chatId: currentChat.id, userId: vkUser?.id });
            }
        });
        
        window.socket.on('new_message', (message) => {
            if (currentChat && message.chat_id === currentChat.id) {
                addMessageToChat(message);
            }
        });
        
        window.socket.on('user_joined', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers.add(data.userId);
                updateOnlineCount();
                showNotification('👤 Собеседник присоединился к чату');
            }
        });
        
        window.socket.on('user_left', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers.delete(data.userId);
                updateOnlineCount();
                showPartnerLeftModal();
            }
        });
        
        window.socket.on('chat_activated', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                showNotification('🎉 Чат активирован! Начинайте общение');
            }
            loadAndRenderChats();
        });
        
        window.socket.on('typing_start', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                const typingIndicator = document.getElementById('typingIndicator');
                if (typingIndicator) {
                    typingIndicator.style.display = 'inline';
                }
            }
        });
        
        window.socket.on('typing_stop', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                const typingIndicator = document.getElementById('typingIndicator');
                if (typingIndicator) {
                    typingIndicator.style.display = 'none';
                }
            }
        });
        
        window.socket.on('online_users', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers = new Set(data.users);
                updateOnlineCount();
            }
        });
        
        window.socket.on('error', (data) => {
            showNotification('❌ ' + data.message);
        });
        
        window.socket.on('new_chat_created', (chat) => {
            console.log('📨 Получен новый чат:', chat);
            
            const newChat = {
                id: chat.id,
                gender: chat.user_gender + ', ' + chat.user_age,
                lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
                theme: chat.theme,
                participants_count: chat.participants_count,
                timestamp: new Date(chat.created_at).getTime()
            };
            
            allChats.unshift(newChat);
            
            if (chat.theme === currentTheme) {
                renderChatsList();
                showNotification('📢 Создан новый чат в разделе "' + chat.theme + '"');
            }
        });
        
        window.socket.on('chat_removed', (data) => {
            console.log('🗑️ Чат удален:', data.chatId);
            allChats = allChats.filter(chat => chat.id !== data.chatId);
            renderChatsList();
        });
        
    } catch (error) {
        console.error('Socket error:', error);
    }
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) {
        onlineCountElement.textContent = count + ' онлайн';
    }
}

function handleTyping() {
    if (!currentChat || !window.socket) return;
    
    window.socket.emit('typing_start', { 
        chatId: currentChat.id, 
        userId: vkUser?.id 
    });
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        window.socket.emit('typing_stop', { 
            chatId: currentChat.id, 
            userId: vkUser?.id 
        });
    }, 1000);
}

// Функция для загрузки чатов с сервера
window.loadChatsFromServer = async function() {
    try {
        console.log('📡 Загрузка чатов с сервера...');
        const response = await fetch(API_URL + '/api/chats');
        
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        
        const chats = await response.json();
        console.log('✅ Загружено чатов:', chats.length);
        
        return chats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime()
        }));
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

async function loadAndRenderChats() {
    console.log('🔄 Загрузка и отрисовка чатов...');
    const chats = await window.loadChatsFromServer();
    allChats = chats;
    renderChatsList();
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) {
        console.error('❌ Контейнер чатов не найден');
        return;
    }
    
    container.innerHTML = '';

    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);
    console.log(`📊 Отображаем чаты для "${currentTheme}":`, filteredChats.length);

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
    const modal = document.getElementById('createChatModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (modal && modalTitle) {
        modalTitle.textContent = 'Создать чат для ' + currentTheme;
        modal.style.display = 'block';
    }
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    const minAgeValue = document.getElementById('minAgeValue');
    const maxAgeValue = document.getElementById('maxAgeValue');
    const minAgeInput = document.getElementById('minAge');
    const maxAgeInput = document.getElementById('maxAge');
    
    if (!minSlider || !maxSlider || !minAgeValue || !maxAgeValue) return;
    
    let minAge = parseInt(minSlider.value);
    let maxAge = parseInt(maxSlider.value);
    
    if (minAge > maxAge) {
        minAge = maxAge;
        minSlider.value = minAge;
    }
    
    minAgeValue.textContent = minAge;
    maxAgeValue.textContent = maxAge;
    
    if (minAgeInput) minAgeInput.value = minAge;
    if (maxAgeInput) maxAgeInput.value = maxAge;
}

async function createChat() {
    console.log('🔍 Начинаем создание чата...');
    
    const myGenderElement = document.querySelector('#myGenderOptions .option-button.active');
    const myAgeElement = document.getElementById('myAge');
    const partnerGenderElement = document.querySelector('#partnerGenderOptions .option-button.active');
    const minAgeElement = document.getElementById('minAge');
    const maxAgeElement = document.getElementById('maxAge');

    if (!myGenderElement || !myAgeElement || !partnerGenderElement || !minAgeElement || !maxAgeElement) {
        showNotification('❌ Ошибка: не все поля заполнены');
        return;
    }

    const myGender = myGenderElement.textContent;
    const myAge = parseInt(myAgeElement.value);
    const partnerGender = partnerGenderElement.textContent;
    const minAge = parseInt(minAgeElement.value);
    const maxAge = parseInt(maxAgeElement.value);

    console.log('📊 Данные для создания чата:', { myGender, myAge, partnerGender, minAge, maxAge, theme: currentTheme });

    // Валидация
    if (!myGender || !partnerGender) {
        showNotification('❌ Пожалуйста, выберите пол');
        return;
    }

    if (!myAge || myAge < 18 || myAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возраст (18-80)');
        return;
    }

    if (!minAge || !maxAge || minAge >= maxAge || minAge < 18 || maxAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возрастной диапазон (18-80)');
        return;
    }

    // Сохраняем параметры
    lastChatParams = {
        myGender: myGender,
        myAge: myAge,
        partnerGender: partnerGender,
        minAge: minAge,
        maxAge: maxAge,
        theme: currentTheme
    };

    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: myGender,
        user_age: myAge,
        partner_gender: partnerGender,
        min_age: minAge,
        max_age: maxAge,
        theme: currentTheme
    };

    console.log('📨 Отправляем данные на сервер:', chatData);

    try {
        const response = await fetch(API_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatData)
        });
        
        console.log('📡 Ответ сервера:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Чат создан:', result);
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            showNotification('✅ Чат успешно создан! Ожидаем собеседника...');
            closeCreateChatModal();
            
            // Создаем объект чата для отображения
            const newChat = {
                id: result.id,
                gender: myGender + ', ' + myAge,
                lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                theme: currentTheme,
                participants_count: 1,
                timestamp: Date.now()
            };
            
            // Добавляем в список и переходим к чату
            allChats.unshift(newChat);
            setTimeout(() => startChat(newChat), 500);
            
        } else {
            const errorText = await response.text();
            console.error('❌ Ошибка сервера:', errorText);
            throw new Error('Ошибка сервера: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
    }
}

async function startChat(chat) {
    console.log('💬 Запуск чата:', chat.id);
    
    // Очищаем предыдущий чат
    if (currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    currentChat = chat;
    
    // Обновляем заголовок чата
    const chatRoomTitle = document.getElementById('chatRoomTitle');
    if (chatRoomTitle) {
        chatRoomTitle.textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    }
    
    // Показываем экран чата
    showScreen('chatRoomScreen');
    
    // Очищаем сообщения
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Загружаем чат...</div>
            </div>
        `;
    }
    
    // Присоединяемся к чату через socket
    if (window.socket) {
        window.socket.emit('join_chat', { chatId: chat.id, userId: vkUser?.id });
    }
    
    // Загружаем сообщения
    await loadMessages(chat.id);
    
    // Фокусируемся на поле ввода
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 300);
}

// Функция для эмодзи в заголовке чата
function getChatEmoji(theme) {
    const emojiMap = {
        'Общение': '💬',
        'Флирт': '😊',
        'Роль': '🎭'
    };
    return emojiMap[theme] || '💬';
}

async function loadMessages(chatId) {
    try {
        console.log('📨 Загрузка сообщений для чата:', chatId);
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщений: ' + response.status);
        }
        
        const messages = await response.json();
        console.log('✅ Загружено сообщений:', messages.length);
        
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                    <div>Пока нет сообщений</div>
                    <div style="font-size: 14px; margin-top: 8px;">Начните общение первым!</div>
                </div>
            `;
            return;
        }
        
        messages.forEach(msg => {
            addMessageToChat(msg);
        });
        
        // Прокручиваем к последнему сообщению
        container.scrollTop = container.scrollHeight;
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        showNotification('Ошибка загрузки сообщений');
    }
}

function addMessageToChat(message) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    // Очищаем сообщение "Пока нет сообщений"
    if (container.innerHTML.includes('Пока нет сообщений')) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    const isMyMessage = message.user_id === (vkUser?.id || 'anonymous');
    messageElement.className = 'message ' + (isMyMessage ? 'message-my' : 'message-their');
    
    const messageContent = `
        <div class="message-content">${escapeHtml(message.message)}</div>
        <div class="message-time">${new Date(message.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
    messageElement.innerHTML = messageContent;
    container.appendChild(messageElement);
    
    // Прокручиваем к новому сообщению
    container.scrollTop = container.scrollHeight;
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    
    const text = input.value.trim();
    
    if (!text || !currentChat) {
        return;
    }

    try {
        const response = await fetch(API_URL + '/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: currentChat.id,
                user_id: vkUser?.id || 'anonymous',
                message: text
            })
        });
        
        if (response.ok) {
            input.value = '';
            userStats.sentMessages++;
            saveUserStats();
            updateProfileStats();
            
            // Останавливаем индикатор печати
            if (window.socket) {
                window.socket.emit('typing_stop', { 
                    chatId: currentChat.id, 
                    userId: vkUser?.id 
                });
            }
        } else {
            throw new Error('Ошибка отправки: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        showNotification('❌ Ошибка отправки сообщения');
    }
}

function closeCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function toggleOption(element) {
    if (!element) return;
    
    const parent = element.parentElement;
    if (!parent) return;
    
    parent.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function showScreen(screenId) {
    console.log('🔄 Переключение на экран:', screenId);
    
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    
    // Показываем выбранный экран
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // Обновляем активное состояние в меню
    updateMenuActiveState(screenId);
    
    // Управляем видимостью меню
    toggleBottomMenu(screenId);
    
    // Выходим из чата если переключаемся на другой экран
    if (screenId !== 'chatRoomScreen' && currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
        
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    }
}

// Обновление активного состояния меню
function updateMenuActiveState(screenId) {
    const menuItems = document.querySelectorAll('.bottom-menu .menu-item');
    menuItems.forEach(item => item.classList.remove('active'));
    
    const menuIndex = {
        'chatsScreen': 0,
        'profileScreen': 1,
        'settingsScreen': 2
    }[screenId];
    
    if (menuIndex !== undefined && menuItems[menuIndex]) {
        menuItems[menuIndex].classList.add('active');
    }
}

// Переключение видимости нижнего меню
function toggleBottomMenu(screenId) {
    const bottomMenu = document.querySelector('.bottom-menu');
    if (bottomMenu) {
        if (screenId === 'chatRoomScreen' || screenId === 'waitingScreen') {
            bottomMenu.style.display = 'none';
        } else {
            bottomMenu.style.display = 'flex';
        }
    }
}

function loadUserStats() {
    try {
        const savedStats = localStorage.getItem('user_stats');
        if (savedStats) {
            userStats = JSON.parse(savedStats);
        }
        
        const firstVisit = localStorage.getItem('first_visit');
        if (!firstVisit) {
            localStorage.setItem('first_visit', Date.now().toString());
        } else {
            const days = Math.floor((Date.now() - parseInt(firstVisit)) / (1000 * 60 * 60 * 24));
            userStats.daysActive = Math.max(1, days);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
    }
}

function saveUserStats() {
    try {
        localStorage.setItem('user_stats', JSON.stringify(userStats));
    } catch (error) {
        console.error('❌ Ошибка сохранения статистики:', error);
    }
}

function updateProfileStats() {
    const elements = {
        'chatsCount': userStats.createdChats,
        'messagesCount': userStats.sentMessages,
        'friendsCount': userStats.friends,
        'daysCount': userStats.daysActive,
        'profileReputation': userStats.reputation
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return minutes + ' мин назад';
    if (hours < 24) return hours + ' ч назад';
    return Math.floor(hours / 24) + ' дн назад';
}

function showNotification(message) {
    // Удаляем существующие уведомления
    const existingSnackbars = document.querySelectorAll('.snackbar');
    existingSnackbars.forEach(snackbar => {
        if (snackbar.parentNode) {
            snackbar.remove();
        }
    });
    
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.textContent = message;
    document.body.appendChild(snackbar);
    
    setTimeout(() => {
        if (snackbar.parentNode) {
            snackbar.remove();
        }
    }, 3000);
}

function setupEventListeners() {
    console.log('🔧 Настройка обработчиков событий...');
    
    // Обработчики для модальных окон
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    // Обработчик Enter для отправки сообщений
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // Обработчики для слайдеров возраста
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
    if (minSlider && maxSlider) {
        minSlider.addEventListener('input', updateAgeRange);
        maxSlider.addEventListener('input', updateAgeRange);
    }
    
    // Инициализация слайдеров
    updateAgeRange();
}

// Функции для чата
function addToFriends() {
    showNotification('✅ Пользователь добавлен в друзья!');
    userStats.friends++;
    saveUserStats();
    updateProfileStats();
}

function reportUser() {
    showNotification('⚠️ Жалоба отправлена модераторам');
}

// Простые функции для кнопок
function enableNotifications() {
    showNotification('🔔 Уведомления включены!');
}

function openMyChats() {
    const myChatsCount = allChats.filter(chat => chat.userId === vkUser?.id).length;
    if (myChatsCount > 0) {
        showNotification(`У вас ${myChatsCount} активных чатов`);
    } else {
        showNotification('У вас пока нет активных чатов');
    }
}

function shareApp() {
    showNotification('Поделитесь приложением с друзьями!');
}

function inviteFriends() {
    showNotification('Пригласите друзей в приложение!');
}

function addToFavorites() {
    showNotification('✅ Добавлено в избранное!');
}

function support() {
    showNotification('Напишите нам в сообщения группы VK');
}

function openNotificationsSettings() {
    showNotification('Настройки уведомлений в разработке');
}

function openAppInfo() {
    showNotification('Анонимный чат v2.0 для VK');
}

// Функция показа модалки при выходе собеседника
function showPartnerLeftModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 300px;">
            <div class="modal-header">
                <div class="modal-title">👤 Собеседник покинул чат</div>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 20px;">Что вы хотите сделать?</p>
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
                    <button class="action-button" onclick="recreateChat()" style="width: 100%;">
                        🔄 Создать такой же чат
                    </button>
                    <button class="action-button" onclick="goToChats()" style="width: 100%;">
                        💬 Вернуться к чатам
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function recreateChat() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    
    if (lastChatParams) {
        createChatWithParams(lastChatParams);
    } else {
        showScreen('chatsScreen');
    }
}

function goToChats() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    showScreen('chatsScreen');
}

// Функция создания чата с параметрами
function createChatWithParams(params) {
    console.log('🔄 Создание чата с параметрами:', params);
    
    // Закрываем текущий чат если открыт
    if (currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    // Очищаем текущий чат
    currentChat = null;
    
    // Очищаем сообщения
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Создаем новый чат...</div>
            </div>
        `;
    }
    
    // Создаем чат
    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: params.myGender,
        user_age: params.myAge,
        partner_gender: params.partnerGender,
        min_age: params.minAge,
        max_age: params.maxAge,
        theme: params.theme
    };

    fetch(API_URL + '/api/chats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        return response.json();
    })
    .then(result => {
        console.log('✅ Новый чат создан:', result);
        
        userStats.createdChats++;
        saveUserStats();
        updateProfileStats();
        showNotification('✅ Новый чат создан! Ожидаем собеседника...');
        
        // Создаем объект нового чата
        const newChat = {
            id: result.id,
            gender: params.myGender + ', ' + params.myAge,
            lookingFor: params.partnerGender + ', ' + params.minAge + '-' + params.maxAge,
            theme: params.theme,
            participants_count: 1,
            timestamp: Date.now()
        };
        
        // Запускаем новый чат
        startChat(newChat);
    })
    .catch(error => {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
        // Если ошибка - показываем экран чатов
        showScreen('chatsScreen');
    });
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, запускаем приложение...');
    initApp();
});

// Глобальные функции для HTML
window.switchChatTab = switchChatTab;
window.openCreateChatModal = openCreateChatModal;
window.closeCreateChatModal = closeCreateChatModal;
window.toggleOption = toggleOption;
window.createChat = createChat;
window.showScreen = showScreen;
window.sendMessage = sendMessage;
window.handleTyping = handleTyping;
window.addToFriends = addToFriends;
window.reportUser = reportUser;
window.enableNotifications = enableNotifications;
window.openMyChats = openMyChats;
window.shareApp = shareApp;
window.inviteFriends = inviteFriends;
window.addToFavorites = addToFavorites;
window.support = support;
window.openNotificationsSettings = openNotificationsSettings;
window.openAppInfo = openAppInfo;
window.recreateChat = recreateChat;
window.goToChats = goToChats;
