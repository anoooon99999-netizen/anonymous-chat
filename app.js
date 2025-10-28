// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let wstringTimer = null;
let wstringStartTime = null;
let onlinelUserEvent = 0;
let waitingTimer = null;
let waitingSeconds = 0;

// ===== БАЗОВЫЕ ФУНКЦИИ ИНТЕРФЕЙСА =====

// Переключение между экранами
function showScreen(screenId) {
    console.log('Переключение на экран:', screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // Обновляем активное меню
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
    });
    
    if (screenId === 'chatsScreen') {
        document.querySelector('.menu-item:nth-child(1)')?.classList.add('active');
    } else if (screenId === 'profileScreen') {
        document.querySelector('.menu-item:nth-child(2)')?.classList.add('active');
    } else if (screenId === 'settingsScreen') {
        document.querySelector('.menu-item:nth-child(3)')?.classList.add('active');
    }
}

// Переключение вкладок чатов
function switchChatTab(tabName) {
    console.log('Переключение на вкладку:', tabName);
    
    // Обновляем активные вкладки
    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Активируем выбранную вкладку
    const activeTab = Array.from(tabs).find(tab => 
        tab.textContent.includes(tabName)
    );
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Обновляем текст создания чата
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = `Создать чат для ${tabName}`;
    }
}

// Функции для модального окна
function openCreateChatModal() {
    console.log('Открытие модального окна создания чата');
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeCreateChatModal() {
    console.log('Закрытие модального окна');
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function toggleOption(button) {
    const parent = button.parentElement;
    const buttons = parent.querySelectorAll('.option-button');
    buttons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    const minAgeValue = document.getElementById('minAgeValue');
    const maxAgeValue = document.getElementById('maxAgeValue');
    
    if (minSlider && maxSlider && minAgeValue && maxAgeValue) {
        minAgeValue.textContent = minSlider.value;
        maxAgeValue.textContent = maxSlider.value;
    }
}

// Базовые функции интерфейса
function enableNotifications() {
    console.log('Включение уведомлений');
    alert('Уведомления включены!');
}

function createChat() {
    console.log('Создание чата с параметрами поиска');
    
    // Получаем выбранные параметры
    const myGender = document.querySelector('#myGenderOptions .option-button.active')?.textContent || 'Мужской';
    const partnerGender = document.querySelector('#partnerGenderOptions .option-button.active')?.textContent || 'Любой';
    const myAge = document.getElementById('myAge')?.value || '25';
    const minAge = document.getElementById('minAgeSlider')?.value || '18';
    const maxAge = document.getElementById('maxAgeSlider')?.value || '35';
    
    console.log('Параметры поиска:', {
        myGender,
        partnerGender, 
        myAge,
        minAge,
        maxAge
    });
    
    // Закрываем модальное окно
    closeCreateChatModal();
    
    // Запускаем поиск собеседника
    startWaiting();
}

function cancelWaiting() {
    console.log('Отмена поиска собеседника');
    
    // Останавливаем таймер
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    // Возвращаем на главный экран
    showScreen('chatsScreen');
}

function shareApp() {
    console.log('Поделиться приложением');
    alert('Функция "Поделиться приложением"');
}

function openMyChats() {
    console.log('Открытие моих чатов');
    alert('Функция "Мои чаты"');
}

function inviteFriends() {
    console.log('Приглашение друзей');
    alert('Функция "Пригласить друзей"');
}

function openNotificationsSettings() {
    console.log('Настройки уведомлений');
    alert('Настройки уведомлений');
}

function openPrivacySettings() {
    console.log('Настройки приватности');
    alert('Настройки приватности');
}

function addToFavorites() {
    console.log('Добавить в избранное');
    alert('Добавлено в избранное');
}

function openAppInfo() {
    console.log('О приложении');
    alert('О приложении');
}

function support() {
    console.log('Поддержка');
    alert('Связь с поддержкой');
}

function addToFriends() {
    console.log('Добавить в друзья');
    alert('Запрос на добавление в друзья отправлен');
}

function reportUser() {
    console.log('Пожаловаться на пользователя');
    alert('Жалоба отправлена');
}

function handleTyping() {
    console.log('Пользователь печатает...');
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input && input.value.trim()) {
        console.log('Отправка сообщения:', input.value);
        alert('Сообщение отправлено: ' + input.value);
        input.value = '';
    }
}

// ===== ФУНКЦИИ ДЛЯ ЭКРАНА ОЖИДАНИЯ =====

function startWaiting() {
    console.log('Начало поиска собеседника');
    showScreen('waitingScreen');
    startWaitingTimer();
    updateOnlineUsers();
    
    // Симуляция поиска собеседника
    simulateSearch();
}

function startWaitingTimer() {
    waitingSeconds = 0;
    updateWaitingTime();
    
    if (waitingTimer) {
        clearInterval(waitingTimer);
    }
    
    waitingTimer = setInterval(() => {
        waitingSeconds++;
        updateWaitingTime();
        
        // Каждые 10 секунд обновляем статистику
        if (waitingSeconds % 10 === 0) {
            updateOnlineUsers();
        }
        
        // Автоматический подбор через 30 секунд (для демо)
        if (waitingSeconds === 30) {
            autoFindPartner();
        }
    }, 1000);
}

function updateWaitingTime() {
    const minutes = Math.floor(waitingSeconds / 60);
    const seconds = waitingSeconds % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const waitingTimeElement = document.getElementById('waitingTime');
    if (waitingTimeElement) {
        waitingTimeElement.textContent = timeString;
    }
}

function updateOnlineUsers() {
    // Случайное количество онлайн пользователей от 1500 до 2500
    const onlineCount = Math.floor(Math.random() * 1000) + 1500;
    const onlineUsersElement = document.getElementById('onlineUsersCount');
    if (onlineUsersElement) {
        onlineUsersElement.textContent = onlineCount.toLocaleString();
    }
}

function simulateSearch() {
    const waitingText = document.getElementById('waitingText');
    const steps = [
        "Ищем собеседника по вашим критериям...",
        "Проверяем доступных пользователей...", 
        "Подбираем оптимальную пару...",
        "Анализируем интересы...",
        "Почти нашли подходящего собеседника..."
    ];
    
    let currentStep = 0;
    
    const searchInterval = setInterval(() => {
        if (waitingText) {
            waitingText.textContent = steps[currentStep];
            currentStep = (currentStep + 1) % steps.length;
        }
    }, 3000);
    
    // Остановить анимацию когда найден собеседник
    setTimeout(() => {
        clearInterval(searchInterval);
    }, 29000);
}

function autoFindPartner() {
    console.log('Собеседник найден!');
    
    // Останавливаем таймер
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    // Показываем уведомление о найденном собеседнике
    showPartnerFoundNotification();
}

function showPartnerFoundNotification() {
    const waitingContent = document.querySelector('.waiting-content');
    if (!waitingContent) return;
    
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = 'partner-found-notification';
    notification.innerHTML = `
        <div class="found-animation">🎉</div>
        <div class="found-title">Собеседник найден!</div>
        <div class="found-subtitle">Переходим в чат...</div>
        <button class="start-chat-button" onclick="enterChatRoom()">Начать общение</button>
    `;
    
    // Заменяем контент ожидания на уведомление
    waitingContent.innerHTML = '';
    waitingContent.appendChild(notification);
    
    // Автоматический переход через 5 секунд
    setTimeout(enterChatRoom, 5000);
}

function enterChatRoom() {
    console.log('Вход в чат комнату');
    
    // Останавливаем таймер если еще работает
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    // Показываем экран чата
    showScreen('chatRoomScreen');
    
    // Добавляем приветственное сообщение
    addWelcomeMessage();
}

function addWelcomeMessage() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    // Очищаем предыдущие сообщения
    messagesContainer.innerHTML = '';
    
    // Добавляем приветственное сообщение
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'message received';
    welcomeMessage.innerHTML = `
        <div class="message-avatar">👤</div>
        <div class="message-content">
            <div class="message-text">Привет! Рад познакомиться 😊 Как дела?</div>
            <div class="message-time">только что</div>
        </div>
    `;
    
    messagesContainer.appendChild(welcomeMessage);
    
    // Прокручиваем вниз
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('Приложение инициализировано');
    // Убедимся что показан правильный экран
    showScreen('chatsScreen');
    switchChatTab('Общение');
    
    // Инициализация слайдеров возраста
    updateAgeRange();
});

// VK Bridge функции (оставляем оригинальные если нужны)
async function initMeg() {
    try {
        console.log("Инициализация VK Bridge");
        // Ваш оригинальный код VK Bridge...
    } catch (error) {
        console.log("Приложение запущено в браузере");
        // Заглушка для браузера
    }
}
// ===== ПЕРЕМЕННЫЕ ДЛЯ ЧАТОВ =====
let activeChats = [];
let chatIdCounter = 1;

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ЧАТАМИ =====

function addChatToHistory(chatType, partnerInfo) {
    const chatId = 'chat_' + chatIdCounter++;
    const newChat = {
        id: chatId,
        type: chatType,
        partner: partnerInfo || {
            name: 'Анонимный пользователь',
            gender: 'Не указан',
            age: 'Не указан',
            avatar: '👤'
        },
        lastMessage: 'Чат начат',
        timestamp: new Date(),
        unread: 0,
        online: true
    };
    
    activeChats.unshift(newChat); // Добавляем в начало
    updateChatsList();
    return chatId;
}

function updateChatsList() {
    const chatsContainer = document.getElementById('chatsContainer');
    if (!chatsContainer) return;
    
    if (activeChats.length === 0) {
        chatsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-title">Нет активных чатов</div>
                <div class="empty-text">Создайте первый чат чтобы начать общение</div>
            </div>
        `;
        return;
    }
    
    chatsContainer.innerHTML = activeChats.map(chat => `
        <div class="chat-card" onclick="openChat('${chat.id}')">
            <div class="chat-avatar">${chat.partner.avatar}</div>
            <div class="chat-info">
                <div class="chat-header">
                    <div class="chat-name">${chat.partner.name}</div>
                    <div class="chat-time">${formatTime(chat.timestamp)}</div>
                </div>
                <div class="chat-preview">
                    <span class="chat-last-message">${chat.lastMessage}</span>
                    ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
                </div>
                <div class="chat-meta">
                    <span class="chat-type">${getChatTypeIcon(chat.type)} ${chat.type}</span>
                    <span class="online-status ${chat.online ? 'online' : 'offline'}">
                        ${chat.online ? '🟢 онлайн' : '⚫ офлайн'}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

function formatTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days === 1) return 'вчера';
    if (days < 7) return `${days} дн назад`;
    
    return new Date(date).toLocaleDateString('ru-RU');
}

function getChatTypeIcon(type) {
    const icons = {
        'Общение': '💬',
        'Флирт': '😊',
        'Роль': '🎭'
    };
    return icons[type] || '💬';
}

function openChat(chatId) {
    const chat = activeChats.find(c => c.id === chatId);
    if (chat) {
        console.log('Открытие чата:', chatId);
        // Здесь можно добавить логику загрузки сообщений чата
        showScreen('chatRoomScreen');
        
        // Обновляем заголовок чата
        const chatTitle = document.getElementById('chatRoomTitle');
        if (chatTitle) {
            chatTitle.textContent = `Чат с ${chat.partner.name}`;
        }
        
        // Загружаем историю сообщений
        loadChatHistory(chatId);
        
        // Помечаем как прочитанное
        markAsRead(chatId);
    }
}

function loadChatHistory(chatId) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    // Очищаем контейнер
    messagesContainer.innerHTML = '';
    
    // Добавляем приветственные сообщения
    const welcomeMessages = [
        {
            type: 'received',
            text: 'Привет! Рад познакомиться 😊',
            time: new Date(Date.now() - 120000)
        },
        {
            type: 'received', 
            text: 'Как твои дела?',
            time: new Date(Date.now() - 60000)
        }
    ];
    
    welcomeMessages.forEach(msg => {
        addMessageToChat(msg.text, msg.type, msg.time);
    });
}

function addMessageToChat(text, type = 'received', timestamp = new Date()) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.innerHTML = `
        <div class="message-avatar">${type === 'received' ? '👤' : '😊'}</div>
        <div class="message-content">
            <div class="message-text">${text}</div>
            <div class="message-time">${formatTime(timestamp)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function markAsRead(chatId) {
    const chat = activeChats.find(c => c.id === chatId);
    if (chat) {
        chat.unread = 0;
        updateChatsList();
    }
}

// ===== ОБНОВЛЕННАЯ ФУНКЦИЯ СОЗДАНИЯ ЧАТА =====

function createChat() {
    console.log('Создание чата с параметрами поиска');
    
    // Получаем выбранные параметры
    const myGender = document.querySelector('#myGenderOptions .option-button.active')?.textContent || 'Мужской';
    const partnerGender = document.querySelector('#partnerGenderOptions .option-button.active')?.textContent || 'Любой';
    const myAge = document.getElementById('myAge')?.value || '25';
    const minAge = document.getElementById('minAgeSlider')?.value || '18';
    const maxAge = document.getElementById('maxAgeSlider')?.value || '35';
    
    // Определяем тип чата из активной вкладки
    const activeTab = document.querySelector('.chat-tab.active');
    const chatType = activeTab ? activeTab.textContent.replace(/[^\w\s]/g, '').trim() : 'Общение';
    
    console.log('Параметры поиска:', {
        chatType,
        myGender,
        partnerGender, 
        myAge,
        minAge,
        maxAge
    });
    
    // Закрываем модальное окно
    closeCreateChatModal();
    
    // Запускаем поиск собеседника
    startWaiting(chatType);
}

// Обновляем функцию startWaiting чтобы принимать тип чата
function startWaiting(chatType = 'Общение') {
    console.log('Начало поиска собеседника для:', chatType);
    showScreen('waitingScreen');
    startWaitingTimer();
    updateOnlineUsers();
    
    // Сохраняем тип чата для использования при создании
    window.currentChatType = chatType;
    
    // Симуляция поиска собеседника
    simulateSearch();
}

// Обновляем функцию autoFindPartner
function autoFindPartner() {
    console.log('Собеседник найден!');
    
    // Останавливаем таймер
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    // Создаем чат в истории
    const partnerInfo = generatePartnerInfo();
    const chatId = addChatToHistory(window.currentChatType, partnerInfo);
    window.currentChatId = chatId;
    
    // Показываем уведомление о найденном собеседнике
    showPartnerFoundNotification();
}

function generatePartnerInfo() {
    const genders = ['Мужской', 'Женский'];
    const names = {
        'Мужской': ['Алексей', 'Дмитрий', 'Максим', 'Иван', 'Сергей'],
        'Женский': ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья']
    };
    
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const name = names[gender][Math.floor(Math.random() * names[gender].length)];
    const age = Math.floor(Math.random() * 20) + 18; // 18-38 лет
    
    return {
        name: name,
        gender: gender,
        age: age,
        avatar: gender === 'Мужской' ? '👨' : '👩'
    };
}
