// Обход ошибки VK Bridge
if (typeof vkBridge === 'undefined') {
    window.vkBridge = {
        send: (method, params) => {
            console.log('📱 VK Bridge mock:', method, params);
            return Promise.resolve({});
        },
        subscribe: (handler) => {
            console.log('📱 VK Bridge subscribe mock');
        },
        supports: (method) => {
            return false;
        }
    };
}

// Конфигурация
const API_URL = window.location.origin;
const SOCKET_URL = window.location.origin;

// Глобальные переменные
let socket;
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

// Простая инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Запуск приложения...');
    
    // Быстрая инициализация
    initApp();
});

async function initApp() {
    console.log('📱 Инициализация приложения...');
    
    try {
        // Простая проверка VK
        if (typeof vkBridge !== 'undefined') {
            console.log('🔗 VK Bridge обнаружен');
            try {
                await vkBridge.send('VKWebAppInit');
                console.log('✅ VKWebAppInit успешно');
                isVK = true;
                
                // Пробуем получить данные пользователя
                try {
                    const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
                    vkUser = userInfo;
                    console.log('✅ Данные пользователя получены');
                } catch (userError) {
                    console.log('⚠️ Не удалось получить данные пользователя');
                    createAnonymousUser();
                }
            } catch (vkError) {
                console.log('⚠️ VK инициализация не удалась, работаем в браузере');
                createAnonymousUser();
            }
        } else {
            console.log('🌐 Режим браузера');
            createAnonymousUser();
        }
    } catch (error) {
        console.log('❌ Ошибка инициализации, продолжаем в автономном режиме');
        createAnonymousUser();
    }
    
    // Запускаем основную функциональность
    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    // Скрываем прелоадер
    hidePreloader();
    
    console.log('✅ Приложение полностью инициализировано');
}

function createAnonymousUser() {
    vkUser = { 
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        first_name: 'Аноним',
        last_name: '',
        sex: Math.random() > 0.5 ? 2 : 1
    };
    updateUserInterface(vkUser);
}

function updateUserInterface(userInfo) {
    const userNameElement = document.getElementById('vkUserName');
    const userInfoElement = document.getElementById('vkUserInfo');
    const profileNameElement = document.getElementById('profileName');
    const currentAvatarElement = document.getElementById('currentAvatar');
    
    if (userNameElement) {
        userNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (userInfoElement && isVK) {
        userInfoElement.style.display = 'block';
    }
    
    if (profileNameElement) {
        profileNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (currentAvatarElement) {
        currentAvatarElement.textContent = userInfo.first_name.charAt(0);
    }
}

function hidePreloader() {
    const preloader = document.getElementById('preloader');
    const preloaderText = document.getElementById('preloaderText');
    
    if (preloaderText) {
        preloaderText.textContent = 'Готово!';
    }
    
    setTimeout(() => {
        if (preloader && preloader.parentNode) {
            preloader.style.opacity = '0';
            setTimeout(() => {
                if (preloader.parentNode) {
                    preloader.remove();
                }
            }, 300);
        }
    }, 500);
}

// Socket.io инициализация
function initSocket() {
    try {
        socket = io(SOCKET_URL);
        window.socket = socket;
        
        socket.on('connect', () => {
            console.log('✅ Connected to server');
            showNotification('Подключено к серверу');
        });
        
        socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            showNotification('Соединение потеряно');
        });
        
        socket.on('new_chat_created', (chat) => {
            console.log('📨 Новый чат создан:', chat);
            addChatToList(chat);
        });
        
        socket.on('chat_removed', (data) => {
            console.log('🗑️ Чат удален:', data.chatId);
            removeChatFromList(data.chatId);
        });
        
        socket.on('new_message', (message) => {
            if (currentChat && message.chat_id === currentChat.id) {
                addMessageToChat(message);
            }
        });
        
        socket.on('error', (data) => {
            showNotification('❌ ' + data.message);
        });
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Socket.io:', error);
    }
}

// Функции для работы с чатами
function addChatToList(chat) {
    const newChat = {
        id: chat.id,
        gender: chat.user_gender + ', ' + chat.user_age,
        lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
        theme: chat.theme,
        participants_count: chat.participants_count || 1,
        timestamp: new Date(chat.created_at).getTime(),
        userId: chat.user_id
    };
    
    allChats = allChats.filter(c => c.id !== newChat.id);
    allChats.unshift(newChat);
    
    renderChatsList();
}

function removeChatFromList(chatId) {
    allChats = allChats.filter(chat => chat.id !== chatId);
    renderChatsList();
}

async function loadAndRenderChats() {
    try {
        console.log('📡 Загрузка активных чатов...');
        const response = await fetch(API_URL + '/api/chats');
        
        if (response.ok) {
            const chats = await response.json();
            const activeChats = chats.filter(chat => chat.participants_count === 1);
            
            allChats = activeChats.map(chat => ({
                id: chat.id,
                gender: chat.user_gender + ', ' + chat.user_age,
                lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
                theme: chat.theme,
                participants_count: chat.participants_count,
                timestamp: new Date(chat.created_at).getTime(),
                userId: chat.user_id
            }));
            
            console.log('✅ Загружено активных чатов:', allChats.length);
            renderChatsList();
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
    }
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) return;
    
    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);
    
    if (filteredChats.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                <div>Активных чатов в разделе "${currentTheme}" пока нет</div>
                <div style="font-size: 14px; margin-top: 8px;">Создайте первый чат!</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
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
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <div class="theme-tag">${chat.theme}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    ${getTimeAgo(chat.timestamp)}
                </div>
            </div>
        `;
        
        container.appendChild(chatElement);
    });
}

// Навигация по экранам
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    updateMenuActiveState(screenId);
    toggleBottomMenu(screenId);
    
    if (screenId !== 'chatRoomScreen' && currentChat && socket) {
        socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
        currentChat = null;
    }
}

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

function toggleBottomMenu(screenId) {
    const bottomMenu = document.querySelector('.bottom-menu');
    if (bottomMenu) {
        bottomMenu.style.display = (screenId === 'chatRoomScreen') ? 'none' : 'flex';
    }
}

// Работа с чатом
async function startChat(chat) {
    console.log('💬 Запуск чата:', chat.id);
    
    if (currentChat && socket) {
        socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    currentChat = chat;
    
    const chatRoomTitle = document.getElementById('chatRoomTitle');
    if (chatRoomTitle) {
        chatRoomTitle.textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    }
    
    showScreen('chatRoomScreen');
    
    if (socket) {
        socket.emit('join_chat', { 
            chatId: chat.id, 
            userId: vkUser?.id 
        });
    }
    
    await loadMessages(chat.id);
    
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 300);
}

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
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        
        if (response.ok) {
            const messages = await response.json();
            renderMessages(messages);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
    }
}

function renderMessages(messages) {
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
    
    container.scrollTop = container.scrollHeight;
}

function addMessageToChat(message) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (container.innerHTML.includes('Пока нет сообщений') || container.innerHTML.includes('Загружаем чат')) {
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
    container.scrollTop = container.scrollHeight;
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
        } else {
            throw new Error('Ошибка отправки: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        showNotification('❌ Ошибка отправки сообщения');
    }
}

// Утилиты
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    const existingSnackbars = document.querySelectorAll('.snackbar');
    existingSnackbars.forEach(snackbar => snackbar.remove());
    
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.textContent = message;
    document.body.appendChild(snackbar);
    
    setTimeout(() => snackbar.remove(), 3000);
}

function loadUserStats() {
    try {
        const savedStats = localStorage.getItem('user_stats');
        if (savedStats) {
            userStats = JSON.parse(savedStats);
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

function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
}

// VK функции
async function shareApp() {
    try {
        if (isVK) {
            await vkBridge.send('VKWebAppShowShareBox', {
                link: window.location.href
            });
        } else {
            showNotification('📱 Поделитесь ссылкой: ' + window.location.href);
        }
    } catch (error) {
        showNotification('📱 Поделитесь ссылкой: ' + window.location.href);
    }
}

async function inviteFriends() {
    try {
        if (isVK) {
            await vkBridge.send('VKWebAppShowInviteBox');
            showNotification('✅ Приглашение отправлено!');
        } else {
            showNotification('👥 Поделитесь ссылкой с друзьями');
        }
    } catch (error) {
        showNotification('👥 Поделитесь ссылкой: ' + window.location.href);
    }
}

function enableNotifications() {
    showNotification('🔔 Уведомления включены');
}

function openMyChats() {
    showScreen('chatsScreen');
}

function openNotificationsSettings() {
    showNotification('🔔 Настройки уведомлений в разработке');
}

function openPrivacySettings() {
    showNotification('🔒 Настройки конфиденциальности в разработке');
}

function addToFavorites() {
    showNotification('⭐ Добавлено в избранное');
}

function openAppInfo() {
    showNotification('ℹ️ Анонимный чат v1.0 | VK Mini App');
}

function support() {
    showNotification('📞 Поддержка: support@chat.ru');
}

function leaveChat() {
    if (currentChat && socket) {
        socket.emit('leave_chat', { 
            chatId: currentChat.id, 
            userId: vkUser?.id 
        });
    }
    showScreen('chatsScreen');
    showNotification('🚪 Вы вышли из чата');
}

function addToFriends() {
    showNotification('✅ Заявка в друзья отправлена');
    userStats.friends++;
    saveUserStats();
    updateProfileStats();
}

function blockUser() {
    showNotification('🚫 Пользователь заблокирован');
    leaveChat();
}

function reportUser() {
    showNotification('⚠️ Жалоба отправлена модераторам');
}

// Переключение вкладок чатов
function switchChatTab(theme, element) {
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = 'Создать чат для ' + theme;
    }
    
    renderChatsList();
}

// Модальное окно создания чата
function openCreateChatModal() {
    showNotification('📝 Создание чата в разработке');
    // Здесь будет логика модального окна
}

// Глобальные функции
window.switchChatTab = switchChatTab;
window.openCreateChatModal = openCreateChatModal;
window.showScreen = showScreen;
window.sendMessage = sendMessage;
window.enableNotifications = enableNotifications;
window.shareApp = shareApp;
window.openMyChats = openMyChats;
window.inviteFriends = inviteFriends;
window.openNotificationsSettings = openNotificationsSettings;
window.openPrivacySettings = openPrivacySettings;
window.addToFavorites = addToFavorites;
window.openAppInfo = openAppInfo;
window.support = support;
window.leaveChat = leaveChat;
window.addToFriends = addToFriends;
window.blockUser = blockUser;
window.reportUser = reportUser;

console.log('🔧 app.js загружен и готов к работе');
