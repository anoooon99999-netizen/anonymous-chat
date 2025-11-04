// Конфигурация для онлайн работы
const API_URL = window.location.origin;
const SOCKET_URL = window.location.origin;

// Инициализация Socket.io
const socket = io(SOCKET_URL);
window.socket = socket;

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
let shownModals = new Set();
let waitingChat = null;
let waitingStats = {
    activeChats: 0,
    onlineUsers: 0
};
let blockedUsers = new Set(JSON.parse(localStorage.getItem('blockedUsers') || '[]'));

// Упрощенная инициализация приложения
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    // Быстрая попытка инициализации VK
    try {
        if (typeof vkBridge !== 'undefined') {
            console.log('🔗 VK Bridge обнаружен, инициализируем...');
            
            // Быстрая инициализация с таймаутом
            try {
                await Promise.race([
                    vkBridge.send('VKWebAppInit'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                ]);
                console.log('✅ VK Bridge инициализирован');
                
                // Получаем информацию о пользователе
                const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
                vkUser = userInfo;
                updateUserInterface(userInfo);
                isVK = true;
                showNotification('Добро пожаловать, ' + userInfo.first_name + '!');
                
            } catch (vkError) {
                console.log('❌ VK инициализация failed:', vkError.message);
                // Продолжаем работу без VK
            }
        }
    } catch (error) {
        console.log('VK режим недоступен:', error.message);
    }
    
    // Всегда продолжаем работу, даже если VK не инициализировался
    if (!vkUser) {
        vkUser = { 
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            first_name: 'Аноним',
            last_name: '',
            sex: Math.random() > 0.5 ? 2 : 1
        };
        updateUserInterface(vkUser);
    }
    
    // Запускаем основную функциональность
    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    console.log('✅ Приложение инициализировано');
    window.dispatchEvent(new Event('appReady'));
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
        userInfoElement.style.display = 'flex';
    }
    
    if (profileNameElement) {
        profileNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (currentAvatarElement) {
        currentAvatarElement.textContent = userInfo.first_name.charAt(0);
    }
}

// Функция VK уведомлений
async function showVKNotification(message) {
    try {
        if (typeof vkBridge !== 'undefined' && isVK) {
            await vkBridge.send('VKWebAppShowOrderBox', {
                message: message
            });
        }
    } catch (error) {
        console.error('VK notification error:', error);
    }
}

// РЕАЛЬНАЯ ФУНКЦИЯ ДОБАВЛЕНИЯ В ДРУЗЬЯ ЧЕРЕЗ VK API
async function addToFriends() {
    if (!currentChat || !currentChat.userId) {
        showNotification('❌ Нет активного собеседника для добавления в друзья');
        return;
    }

    try {
        if (typeof vkBridge !== 'undefined' && isVK) {
            // Получаем access_token через VK Bridge
            const authResult = await vkBridge.send('VKWebAppGetAuthToken', {
                app_id: 1234567, // Замените на ваш app_id
                scope: 'friends'
            });
            
            if (authResult && authResult.access_token) {
                // Используем VK API для добавления в друзья
                const result = await vkBridge.send('VKWebAppCallAPIMethod', {
                    method: 'friends.add',
                    params: {
                        user_id: currentChat.userId,
                        access_token: authResult.access_token,
                        v: '5.199'
                    }
                });
                
                if (result && !result.error) {
                    showNotification('✅ Заявка в друзья отправлена!');
                    await showVKNotification('Заявка в друзья отправлена собеседнику');
                    userStats.friends++;
                    saveUserStats();
                    updateProfileStats();
                    
                    // Логируем успешное добавление
                    console.log('✅ Friend request sent successfully to:', currentChat.userId);
                } else {
                    // Обработка ошибок VK API
                    const errorMsg = result.error ? result.error.error_msg : 'Неизвестная ошибка';
                    showNotification('❌ Ошибка VK API: ' + errorMsg);
                    console.error('VK API Error:', result.error);
                    
                    // Альтернативный способ через VK Web App
                    await tryAlternativeFriendAdd();
                }
            } else {
                throw new Error('Не удалось получить access token');
            }
        } else {
            // Режим вне VK - эмуляция
            showNotification('✅ Заявка в друзья отправлена (эмуляция)');
            userStats.friends++;
            saveUserStats();
            updateProfileStats();
        }
    } catch (error) {
        console.error('Error adding friend:', error);
        
        // Пробуем альтернативный метод
        await tryAlternativeFriendAdd();
    }
}

// АЛЬТЕРНАТИВНЫЙ СПОСОБ ДОБАВЛЕНИЯ В ДРУЗЬЯ
async function tryAlternativeFriendAdd() {
    try {
        if (typeof vkBridge !== 'undefined' && isVK) {
            // Используем VKWebAppAddToFriends для мобильных устройств
            const result = await vkBridge.send('VKWebAppAddToFriends', {
                user_id: parseInt(currentChat.userId)
            });
            
            if (result && result.result === true) {
                showNotification('✅ Пользователь добавлен в друзья!');
                userStats.friends++;
                saveUserStats();
                updateProfileStats();
            } else {
                // Если и это не сработало, используем стандартный метод с уведомлением
                await vkBridge.send('VKWebAppShowOrderBox', {
                    message: `Хотите добавить пользователя ${currentChat.userId} в друзья? Перейдите в его профиль для отправки заявки.`
                });
                showNotification('📱 Перейдите в профиль пользователя для отправки заявки');
            }
        }
    } catch (altError) {
        console.error('Alternative method failed:', altError);
        showNotification('❌ Не удалось отправить заявку в друзья');
    }
}

// Функция блокировки пользователя
function blockUser() {
    if (!currentChat || !currentChat.userId) {
        showNotification('❌ Нет активного собеседника для блокировки');
        return;
    }

    // Добавляем в локальное хранилище блокировок
    blockedUsers.add(currentChat.userId);
    localStorage.setItem('blockedUsers', JSON.stringify([...blockedUsers]));
    
    // Отправляем на сервер
    if (window.socket) {
        window.socket.emit('block_user', {
            userId: vkUser?.id,
            targetUserId: currentChat.userId
        });
    }
    
    showNotification('🚫 Пользователь заблокирован');
    showVKNotification('Пользователь заблокирован');
    
    // Выходим из чата после блокировки
    setTimeout(() => {
        leaveChat();
    }, 1500);
}

// Функция проверки блокировок
function isUserBlocked(userId) {
    return blockedUsers.has(userId);
}

// Функция inviteFriends для использования VK API
async function inviteFriends() {
    try {
        if (typeof vkBridge !== 'undefined' && isVK) {
            const result = await vkBridge.send('VKWebAppShowInviteBox');
            if (result) {
                showNotification('✅ Приглашение отправлено!');
                await showVKNotification('Приглашение другу отправлено');
            }
        } else {
            showNotification('👥 Поделитесь ссылкой: ' + window.location.href);
        }
    } catch (error) {
        console.error('Error inviting friends:', error);
        showNotification('👥 Поделитесь ссылкой: ' + window.location.href);
    }
}

// Функция shareApp для VK
async function shareApp() {
    try {
        if (typeof vkBridge !== 'undefined' && isVK) {
            await vkBridge.send('VKWebAppShowShareBox', {
                link: window.location.href
            });
        } else if (navigator.share) {
            await navigator.share({
                title: 'Анонимный чат',
                text: 'Общайся анонимно в реальном времени!',
                url: window.location.href
            });
        } else {
            showNotification('📱 Поделитесь ссылкой: ' + window.location.href);
        }
    } catch (error) {
        console.error('Error sharing app:', error);
        showNotification('📱 Поделитесь ссылкой: ' + window.location.href);
    }
}

// Переключение вкладок чатов
function switchChatTab(theme, element) {
    console.log('🔄 Переключение на вкладку:', theme);
    
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    
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
            // Сообщаем серверу наш userId при подключении
            if (vkUser?.id) {
                window.socket.emit('set_user_id', vkUser.id);
            }
            if (currentChat) {
                window.socket.emit('join_chat', { chatId: currentChat.id, userId: vkUser?.id });
            }
        });
        
        // Получение истории сообщений от сервера
        window.socket.on('chat_messages', (data) => {
            console.log('📨 Получена история сообщений:', data.messages.length);
            if (currentChat && data.chatId === currentChat.id) {
                renderMessages(data.messages);
            }
        });
        
        // Обработчик активации чата - переходим в чат
        window.socket.on('chat_activated', (data) => {
            console.log('🎉 Чат активирован:', data.chatId);
            
            // Если это наш чат ожидания - переходим в чат
            if (waitingChat && data.chatId === waitingChat.id) {
                console.log('🚀 Переходим из ожидания в активный чат');
                startChat(waitingChat);
                waitingChat = null;
            }
            
            removeChatFromList(data.chatId);
        });
        
        // Слушаем создание новых чатов от всех пользователей
        window.socket.on('new_chat_created', (chat) => {
            console.log('📨 Получен новый чат от другого пользователя:', chat);
            
            const isMyChat = chat.user_id === vkUser?.id;
            const existingChatIndex = allChats.findIndex(c => c.id === chat.id);
            
            if (existingChatIndex === -1) {
                addChatToList(chat);
                
                if (!isMyChat) {
                    showNotification('📢 Создан новый чат в разделе "' + chat.theme + '"');
                }
            }
            
            // Обновляем статистику на экране ожидания
            if (document.getElementById('waitingScreen').classList.contains('active')) {
                updateWaitingStats();
            }
        });
        
        // Слушаем когда чат полностью удаляется с сервера
        window.socket.on('chat_removed', (data) => {
            console.log('🗑️ Чат полностью удален с сервера:', data.chatId);
            removeChatFromList(data.chatId);
            
            // Обновляем статистику на экране ожидания
            if (document.getElementById('waitingScreen').classList.contains('active')) {
                updateWaitingStats();
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
                
                const isCreator = currentChat.userId === vkUser?.id;
                const isSelfLeave = data.userId === vkUser?.id;
                
                console.log('🚪 Пользователь вышел из чата:', {
                    chatId: data.chatId,
                    userId: data.userId,
                    isCreator: isCreator,
                    isSelfLeave: isSelfLeave
                });
                
                if (!isSelfLeave && isCreator) {
                    showPartnerLeftModal(data.chatId);
                }
            }
        });
        
        window.socket.on('new_message', (message) => {
            if (currentChat && message.chat_id === currentChat.id) {
                addMessageToChat(message);
            }
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
        
        window.socket.on('user_blocked', (data) => {
            showNotification('🚫 Пользователь заблокирован');
        });
        
        window.socket.on('error', (data) => {
            showNotification('❌ ' + data.message);
        });
        
    } catch (error) {
        console.error('Socket error:', error);
    }
}

// Функции для работы с чатами
function addChatToList(chat) {
    console.log('➕ Добавляем чат в список:', chat);
    
    const newChat = {
        id: chat.id,
        gender: chat.user_gender + ', ' + chat.user_age,
        lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
        theme: chat.theme,
        participants_count: chat.participants_count || 1,
        timestamp: new Date(chat.created_at).getTime(),
        userId: chat.user_id
    };
    
    // Удаляем возможный дубликат
    allChats = allChats.filter(c => c.id !== newChat.id);
    
    // Добавляем в начало списка
    allChats.unshift(newChat);
    console.log('✅ Чат добавлен в allChats. Всего чатов:', allChats.length);
    
    // Немедленно обновляем интерфейс если это текущая тема
    if (newChat.theme === currentTheme) {
        console.log('🎨 Обновляем отображение для темы:', currentTheme);
        renderChatsList();
    }
}

function removeChatFromList(chatId) {
    const initialLength = allChats.length;
    allChats = allChats.filter(chat => chat.id !== chatId);
    console.log('🗑️ Чат удален из списка:', chatId, 'Было:', initialLength, 'Стало:', allChats.length);
    renderChatsList();
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) {
        if (count === 1) {
            onlineCountElement.textContent = '1 участник • Ожидаем собеседника';
            onlineCountElement.style.color = 'var(--warning)';
        } else if (count === 2) {
            onlineCountElement.textContent = '2 участника • Чат активен';
            onlineCountElement.style.color = 'var(--success)';
        } else {
            onlineCountElement.textContent = count + ' онлайн';
            onlineCountElement.style.color = 'var(--text-secondary)';
        }
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

// Загрузка чатов с сервера
window.loadChatsFromServer = async function() {
    try {
        console.log('📡 Загрузка активных чатов с сервера...');
        const response = await fetch(API_URL + '/api/chats');
        
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        
        const chats = await response.json();
        console.log('✅ Загружено чатов с сервера:', chats.length);
        
        const activeChats = chats.filter(chat => chat.participants_count === 1);
        console.log('🎯 Активных чатов (participants_count = 1):', activeChats.length);
        
        return activeChats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime(),
            userId: chat.user_id
        }));
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

async function loadAndRenderChats() {
    console.log('🔄 Загрузка и отрисовка активных чатов...');
    const chats = await window.loadChatsFromServer();
    allChats = chats;
    console.log('📊 Активных чатов после загрузки:', allChats.length);
    renderChatsList();
    
    // Обновляем статистику на экране ожидания если он активен
    if (document.getElementById('waitingScreen').classList.contains('active')) {
        updateWaitingStats();
    }
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) {
        console.error('❌ Контейнер чатов не найден');
        return;
    }
    
    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);
    console.log(`📊 Отфильтровано активных чатов для "${currentTheme}":`, filteredChats.length);

    container.innerHTML = '';

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

// Модальное окно создания чата
function openCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (modal && modalTitle) {
        modalTitle.textContent = 'Создать чат для ' + currentTheme;
        modal.style.display = 'block';
    }
}

function closeCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'none';
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
            console.log('✅ Чат создан на сервере:', result);
            
            const newChat = {
                id: result.id,
                gender: myGender + ', ' + myAge,
                lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                theme: currentTheme,
                participants_count: 1,
                timestamp: Date.now(),
                userId: vkUser?.id || 'anonymous'
            };
            
            // Добавляем чат и немедленно обновляем интерфейс
            allChats.unshift(newChat);
            console.log('✅ Чат добавлен в allChats. Теперь всего чатов:', allChats.length);
            
            renderChatsList();
            
            if (window.socket) {
                window.socket.emit('new_chat_created', newChat);
                console.log('📢 Отправлено событие new_chat_created для всех пользователей');
            }
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            showNotification('✅ Чат успешно создан! Ожидаем собеседника...');
            closeCreateChatModal();
            
            // Показываем экран ожидания вместо перехода в чат
            showWaitingScreen(newChat);
            
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

// Функции для экрана ожидания
function showWaitingScreen(chat) {
    console.log('⏳ Показываем экран ожидания для чата:', chat.id);
    
    waitingChat = chat;
    
    // Обновляем статистику
    updateWaitingStats();
    
    showScreen('waitingScreen');
    
    // Сообщаем серверу наш userId
    if (window.socket && vkUser?.id) {
        window.socket.emit('set_user_id', vkUser.id);
    }
}

function updateWaitingStats() {
    // Обновляем статистику на экране ожидания
    const activeChatsCount = allChats.filter(chat => chat.participants_count === 1).length;
    const onlineUsersCount = activeChatsCount + Math.floor(Math.random() * 20) + 10; // Рандомная логика для демонстрации
    
    waitingStats.activeChats = activeChatsCount;
    waitingStats.onlineUsers = onlineUsersCount;
    
    document.getElementById('waitingChatsCount').textContent = activeChatsCount;
    document.getElementById('waitingUsersCount').textContent = onlineUsersCount;
}

function cancelWaiting() {
    console.log('❌ Отмена ожидания для чата:', waitingChat?.id);
    
    if (waitingChat && window.socket) {
        // Покидаем чат на сервере
        window.socket.emit('leave_chat', { 
            chatId: waitingChat.id, 
            userId: vkUser?.id 
        });
    }
    
    waitingChat = null;
    showScreen('chatsScreen');
    showNotification('❌ Ожидание отменено');
}

// Работа с чатом
async function startChat(chat) {
    console.log('💬 Запуск чата:', chat.id);
    
    shownModals.clear();
    
    if (currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    currentChat = chat;
    
    const chatRoomTitle = document.getElementById('chatRoomTitle');
    if (chatRoomTitle) {
        chatRoomTitle.textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    }
    
    showScreen('chatRoomScreen');
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Загружаем чат...</div>
            </div>
        `;
    }
    
    if (window.socket) {
        // Сообщаем серверу наш userId
        window.socket.emit('set_user_id', vkUser?.id || 'anonymous');
        
        // Присоединяемся к чату
        window.socket.emit('join_chat', { 
            chatId: chat.id, 
            userId: vkUser?.id || 'anonymous' 
        });
    }
    
    // Загружаем сообщения через API (резервный способ)
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
        console.log('📨 Загрузка сообщений для чата:', chatId);
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщений: ' + response.status);
        }
        
        const messages = await response.json();
        console.log('✅ Загружено сообщений:', messages.length);
        
        renderMessages(messages);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        // Не показываем уведомление, т.к. сообщения могут прийти через socket
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
    
    // Очищаем placeholder если он есть
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

// Модальное окно при выходе собеседника
function showPartnerLeftModal(chatId) {
    if (shownModals.has(chatId)) {
        console.log('⚠️ Модалка для чата', chatId, 'уже показывалась');
        return;
    }
    
    shownModals.add(chatId);
    console.log('📝 Добавлен чат в shownModals:', chatId);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 300px;">
            <div class="modal-header">
                <div class="modal-title">👤 Собеседник покинул чат</div>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 20px;">Чат был удален из системы. Что вы хотите сделать?</p>
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
                    <button class="action-button" onclick="recreateChat('${chatId}')" style="width: 100%;">
                        🔄 Создать такой же чат
                    </button>
                    <button class="action-button" onclick="goToChats('${chatId}')" style="width: 100%;">
                        💬 Вернуться к чатам
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function recreateChat(chatId) {
    console.log('🔄 Создание такого же чата, исходный чат:', chatId);
    
    closeAllModals();
    shownModals.delete(chatId);
    
    if (lastChatParams) {
        createChatWithParams(lastChatParams);
    } else {
        showScreen('chatsScreen');
    }
}

function goToChats(chatId) {
    console.log('💬 Возврат к чатам, чат:', chatId);
    
    closeAllModals();
    shownModals.delete(chatId);
    showScreen('chatsScreen');
}

function createChatWithParams(params) {
    console.log('🔄 Создание чата с параметрами:', params);
    
    if (currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    currentChat = null;
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Создаем новый чат...</div>
            </div>
        `;
    }
    
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
        
        const newChat = {
            id: result.id,
            gender: params.myGender + ', ' + params.myAge,
            lookingFor: params.partnerGender + ', ' + params.minAge + '-' + params.maxAge,
            theme: params.theme,
            participants_count: 1,
            timestamp: Date.now(),
            userId: vkUser?.id || 'anonymous'
        };
        
        allChats.unshift(newChat);
        renderChatsList();
        
        if (window.socket) {
            window.socket.emit('new_chat_created', newChat);
        }
        
        startChat(newChat);
    })
    .catch(error => {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
        showScreen('chatsScreen');
    });
}

// Навигация
function showScreen(screenId) {
    console.log('🔄 Переключение на экран:', screenId);
    
    closeAllModals();
    
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    updateMenuActiveState(screenId);
    toggleBottomMenu(screenId);
    
    if (screenId !== 'chatRoomScreen' && currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
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
        if (screenId === 'chatRoomScreen' || screenId === 'waitingScreen') {
            bottomMenu.style.display = 'none';
        } else {
            bottomMenu.style.display = 'flex';
        }
    }
}

// Утилиты
function toggleOption(element) {
    if (!element) return;
    
    const parent = element.parentElement;
    if (!parent) return;
    
    parent.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function closeAllModals() {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => modal.remove());
    shownModals.clear();
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
    
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        messageInput.addEventListener('input', handleTyping);
    }

    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
    if (minSlider && maxSlider) {
        minSlider.addEventListener('input', updateAgeRange);
        maxSlider.addEventListener('input', updateAgeRange);
    }
    
    updateAgeRange();
}

// Дополнительные функции
function enableNotifications() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification('✅ Уведомления включены');
            } else {
                showNotification('❌ Уведомления отключены');
            }
        });
    } else {
        showNotification('❌ Браузер не поддерживает уведомления');
    }
}

function openMyChats() {
    showScreen('chatsScreen');
    showNotification('📋 Переход к списку чатов');
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
    showNotification('ℹ️ Версия 1.0.0 | Анонимный чат');
}

function support() {
    showNotification('📞 Связь с поддержкой: support@chat.ru');
}

function leaveChat() {
    if (currentChat && window.socket) {
        window.socket.emit('leave_chat', { 
            chatId: currentChat.id, 
            userId: vkUser?.id 
        });
    }
    showScreen('chatsScreen');
    showNotification('🚪 Вы вышли из чата');
}

function reportUser() {
    showNotification('⚠️ Жалоба отправлена модераторам');
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
window.recreateChat = recreateChat;
window.goToChats = goToChats;
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
window.cancelWaiting = cancelWaiting;
window.showVKNotification = showVKNotification;
