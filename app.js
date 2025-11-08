// Конфигурация для онлайн работы
const API_URL = "https://anonymous-chat-mvgx.onrender.com";
const SOCKET_URL = "https://anonymous-chat-mvgx.onrender.com";

// Глобальные переменные
let allChats = [];
let userStats = {
    createdChats: 0,
    sentMessages: 0,
    gamesPlayed: 0,
    friends: 0,
    daysActive: 1,
    level: 1,
    xp: 0,
    achievements: []
};
let isVK = false;
let currentTheme = 'Общение';
let typingTimer = null;
let onlineUsers = new Set();
let lastChatParams = null;
let shownModals = new Set();
let waitingChatId = null;
let currentGame = null;

// ===== СИСТЕМА ГЕНЕРАЦИИ ВОПРОСОВ =====
const questionGenerator = {
    // Темы для вопросов "Правда"
    truthTopics: [
        "мечты", "страхи", "воспоминания", "увлечения", "отношения",
        "работа", "путешествия", "еда", "музыка", "фильмы",
        "книги", "друзья", "семья", "детство", "будущее",
        "успехи", "неудачи", "секреты", "привычки", "цели"
    ],

    // Шаблоны вопросов "Правда"
    truthTemplates: [
        "Какая твоя самая большая мечта о {topic}?",
        "Что тебя больше всего пугает в {topic}?",
        "Какой самый memorable момент связан с {topic}?",
        "Что ты больше всего ценишь в {topic}?",
        "Как изменилось твое отношение к {topic} за последние годы?",
        "Какой совет ты бы дал себе о {topic}?",
        "Что ты скрываешь о своих {topic}?",
        "Как {topic} повлияли на твою жизнь?",
        "Что ты хочешь изменить в своих {topic}?",
        "Какое твое самое сильное воспоминание о {topic}?"
    ],

    // Шаблоны заданий "Действие"
    dareTemplates: [
        "Изобрази {action} без слов",
        "Спой песню о {action}",
        "Расскажи историю про {action}",
        "Покажи танец на тему {action}",
        "Сымитируй звук {action}",
        "Сделай 3 разных жеста на тему {action}",
        "Опиши {action} с закрытыми глазами",
        "Придумай рифму про {action}",
        "Покажи эмоцию, которую вызывает {action}",
        "Изобрази супергероя с силой {action}"
    ],

    // Темы для заданий
    dareTopics: [
        "животное", "профессия", "эмоция", "погода", "транспорт",
        "еда", "спорт", "музыка", "танец", "природа",
        "технологии", "искусство", "кино", "книга", "путешествие",
        "дружба", "любовь", "работа", "отдых", "приключение"
    ],

    // Генерация вопросов для викторины
    quizTopics: [
        {
            topic: "наука",
            questions: [
                {
                    template: "Сколько планет в Солнечной системе?",
                    options: ["7", "8", "9", "10"],
                    correct: 1
                },
                {
                    template: "Какой газ преобладает в атмосфере Земли?",
                    options: ["Кислород", "Азот", "Углекислый газ", "Водород"],
                    correct: 1
                }
            ]
        },
        {
            topic: "география",
            questions: [
                {
                    template: "Какая самая длинная река в мире?",
                    options: ["Амазонка", "Нил", "Янцзы", "Миссисипи"],
                    correct: 0
                },
                {
                    template: "В какой стране находится Эйфелева башня?",
                    options: ["Италия", "Франция", "Германия", "Испания"],
                    correct: 1
                }
            ]
        },
        {
            topic: "искусство",
            questions: [
                {
                    template: "Кто написал 'Войну и мир'?",
                    options: ["Достоевский", "Толстой", "Чехов", "Гоголь"],
                    correct: 1
                },
                {
                    template: "Кто нарисовал 'Мона Лизу'?",
                    options: ["Ван Гог", "Пикассо", "Да Винчи", "Рембрандт"],
                    correct: 2
                }
            ]
        },
        {
            topic: "кино",
            questions: [
                {
                    template: "Кто режиссер фильма 'Титаник'?",
                    options: ["Стивен Спилберг", "Джеймс Кэмерон", "Кристофер Нолан", "Квентин Тарантино"],
                    correct: 1
                },
                {
                    template: "В каком году вышел первый фильм о Гарри Поттере?",
                    options: ["1999", "2001", "2003", "2005"],
                    correct: 1
                }
            ]
        },
        {
            topic: "музыка",
            questions: [
                {
                    template: "Кто исполнил песню 'Bohemian Rhapsody'?",
                    options: ["The Beatles", "Queen", "Rolling Stones", "Led Zeppelin"],
                    correct: 1
                },
                {
                    template: "Сколько струн у стандартной гитары?",
                    options: ["5", "6", "7", "8"],
                    correct: 1
                }
            ]
        }
    ],

    // Слова для "Угадай слово" с подсказками
    wordCategories: [
        {
            category: "технологии",
            words: [
                {word: "компьютер", hint: "Электронное устройство для работы с информацией"},
                {word: "смартфон", hint: "Мобильный телефон с сенсорным экраном"},
                {word: "интернет", hint: "Всемирная сеть для обмена информацией"},
                {word: "программа", hint: "Набор инструкций для выполнения компьютером"},
                {word: "браузер", hint: "Приложение для просмотра веб-страниц"}
            ]
        },
        {
            category: "природа",
            words: [
                {word: "солнце", hint: "Звезда, дающая свет и тепло Земле"},
                {word: "океан", hint: "Огромный водоем с соленой водой"},
                {word: "горы", hint: "Высокие возвышенности на поверхности Земли"},
                {word: "лес", hint: "Большая территория, покрытая деревьями"},
                {word: "река", hint: "Естественный водный поток"}
            ]
        },
        {
            category: "еда",
            words: [
                {word: "пицца", hint: "Итальянское блюдо с тестом и начинкой"},
                {word: "суши", hint: "Японское блюдо с рисом и морепродуктами"},
                {word: "шоколад", hint: "Сладкий продукт из какао-бобов"},
                {word: "кофе", hint: "Напиток из обжаренных зерен"},
                {word: "салат", hint: "Блюдо из смеси различных ингредиентов"}
            ]
        },
        {
            category: "спорт",
            words: [
                {word: "футбол", hint: "Командная игра с мячом и воротами"},
                {word: "баскетбол", hint: "Игра, где мяч забрасывают в кольцо"},
                {word: "теннис", hint: "Игра с ракетками и мячом через сетку"},
                {word: "плавание", hint: "Вид спорта в воде"},
                {word: "бег", hint: "Самый доступный вид спорта"}
            ]
        },
        {
            category: "искусство",
            words: [
                {word: "картина", hint: "Произведение живописи на холсте"},
                {word: "скульптура", hint: "Объемное произведение искусства"},
                {word: "музыка", hint: "Искусство звуков и мелодий"},
                {word: "танец", hint: "Искусство движения под музыку"},
                {word: "поэзия", hint: "Искусство слова в ритмической форме"}
            ]
        }
    ],

    // Эмоции для "Угадай эмоцию"
    emotions: [
        {emotion: "радость", description: "Чувство счастья и удовольствия"},
        {emotion: "грусть", description: "Чувство печали и тоски"},
        {emotion: "злость", description: "Сильное чувство раздражения и гнева"},
        {emotion: "удивление", description: "Реакция на неожиданное событие"},
        {emotion: "страх", description: "Чувство тревоги и опасности"},
        {emotion: "любовь", description: "Сильное чувство привязанности"},
        {emotion: "гордость", description: "Чувство удовлетворения от достижений"},
        {emotion: "стыд", description: "Чувство неловкости за свои действия"},
        {emotion: "волнение", description: "Состояние беспокойства и ожидания"},
        {emotion: "спокойствие", description: "Состояние умиротворения и мира"},
        {emotion: "восхищение", description: "Чувство восторга и одобрения"},
        {emotion: "разочарование", description: "Чувство неудовлетворенности от ожиданий"},
        {emotion: "благодарность", description: "Чувство признательности за помощь"},
        {emotion: "зависть", description: "Чувство желания чужого успеха"},
        {emotion: "надежда", description: "Чувство оптимизма и веры в будущее"}
    ],

    // Генерация случайного вопроса "Правда"
    generateTruthQuestion() {
        const topic = this.truthTopics[Math.floor(Math.random() * this.truthTopics.length)];
        const template = this.truthTemplates[Math.floor(Math.random() * this.truthTemplates.length)];
        return template.replace('{topic}', topic);
    },

    // Генерация случайного задания "Действие"
    generateDare() {
        const topic = this.dareTopics[Math.floor(Math.random() * this.dareTopics.length)];
        const template = this.dareTemplates[Math.floor(Math.random() * this.dareTemplates.length)];
        return template.replace('{action}', topic);
    },

    // Генерация случайного вопроса для викторины
    generateQuizQuestion() {
        const topic = this.quizTopics[Math.floor(Math.random() * this.quizTopics.length)];
        const question = topic.questions[Math.floor(Math.random() * topic.questions.length)];
        return {
            question: question.template,
            options: [...question.options],
            correct: question.correct
        };
    },

    // Генерация случайного слова
    generateWord() {
        const category = this.wordCategories[Math.floor(Math.random() * this.wordCategories.length)];
        const wordData = category.words[Math.floor(Math.random() * category.words.length)];
        return wordData;
    },

    // Генерация случайной эмоции
    generateEmotion() {
        return this.emotions[Math.floor(Math.random() * this.emotions.length)];
    }
};

// ===== СИСТЕМА ИГР =====
const games = {
    truthOrDare: {
        name: "Правда или Действие",
        description: "Отвечай на вопросы или выполняй задания"
    },
    
    quiz: {
        name: "Викторина",
        description: "Проверь свои знания в разных областях"
    },
    
    guessWord: {
        name: "Угадай слово",
        description: "Объясняй и угадывай слова по подсказкам"
    },
    
    guessEmotion: {
        name: "Угадай эмоцию",
        description: "Показывай эмоции жестами и мимикой"
    }
};

// ===== СИСТЕМА ТЕМ =====
let currentAppTheme = 'system';

function initThemeSystem() {
    const savedTheme = localStorage.getItem('app_theme');
    if (savedTheme) {
        currentAppTheme = savedTheme;
    }
    applyTheme(currentAppTheme);
    updateThemeText();
}

function applyTheme(theme) {
    currentAppTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
    updateThemeText();
}

function updateThemeText() {
    const themeText = document.getElementById('currentThemeText');
    if (themeText) {
        const themeNames = {
            'system': 'Системная',
            'light': 'Светлая',
            'dark': 'Темная'
        };
        themeText.textContent = themeNames[currentAppTheme] || 'Системная';
    }
}

// ===== СИСТЕМА ИГР =====
function openGamesMenu() {
    const gamesMenu = document.getElementById('gamesMenu');
    if (gamesMenu) {
        gamesMenu.classList.add('active');
    }
}

function closeGamesMenu() {
    const gamesMenu = document.getElementById('gamesMenu');
    if (gamesMenu) {
        gamesMenu.classList.remove('active');
    }
}

function startGame(gameType) {
    if (!window.currentChat || onlineUsers.size < 2) {
        showNotification('❌ Нужно дождаться подключения собеседника');
        closeGamesMenu();
        return;
    }

    closeGamesMenu();
    
    // Отправляем приглашение в игру собеседнику
    if (window.socket) {
        window.socket.emit('game_invite', {
            chatId: window.currentChat.id,
            gameType: gameType,
            fromUser: window.vkUser?.id || 'anonymous'
        });
    }
    
    showNotification(`🎮 Приглашение в игру отправлено собеседнику`);
}

function acceptGameInvite(gameType) {
    closeAllModals();
    
    // Создаем игру для обоих игроков
    createGameForBoth(gameType);
}

function createGameForBoth(gameType) {
    // Генерируем случайные параметры игры
    let gameData = {};
    
    switch (gameType) {
        case 'truthOrDare':
            const isTruth = Math.random() > 0.5;
            gameData = {
                question: isTruth ? 
                    questionGenerator.generateTruthQuestion() : 
                    questionGenerator.generateDare(),
                isTruth: isTruth
            };
            break;
            
        case 'quiz':
            gameData = {
                question: questionGenerator.generateQuizQuestion()
            };
            break;
            
        case 'guessWord':
            gameData = {
                word: questionGenerator.generateWord()
            };
            break;
            
        case 'guessEmotion':
            gameData = {
                emotion: questionGenerator.generateEmotion()
            };
            break;
    }

    // Отправляем данные игры обоим игрокам
    if (window.socket) {
        window.socket.emit('game_start', {
            chatId: window.currentChat.id,
            gameType: gameType,
            gameData: gameData
        });
    }

    // Запускаем игру локально
    startGameLocally(gameType, gameData);
}

function startGameLocally(gameType, gameData) {
    currentGame = {
        type: gameType,
        state: 'playing',
        players: {},
        data: gameData
    };

    switch (gameType) {
        case 'truthOrDare':
            showTruthOrDareGame(gameData);
            break;
        case 'quiz':
            showQuizGame(gameData);
            break;
        case 'guessWord':
            showGuessWordGame(gameData);
            break;
        case 'guessEmotion':
            showGuessEmotionGame(gameData);
            break;
    }
}

function showTruthOrDareGame(gameData) {
    const gameMessage = `
        <div class="game-question">🎲 Правда или Действие</div>
        <div>${gameData.isTruth ? '📖 Правда:' : '🎯 Действие:'} ${gameData.question}</div>
        <div class="game-options">
            <div class="game-option" onclick="completeTruthOrDare()">✅ Выполнил</div>
            <div class="game-option" onclick="skipTruthOrDare()">❌ Пропустить</div>
        </div>
        <div class="game-stats">
            <span>${getPlayerName(1)}: ❓</span>
            <span>${getPlayerName(2)}: ❓</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
}

function getPlayerName(playerNumber) {
    if (playerNumber === 1) {
        return window.vkUser?.first_name || 'Игрок 1';
    } else {
        return 'Собеседник';
    }
}

function completeTruthOrDare() {
    if (!currentGame) return;
    
    const playerId = window.vkUser?.id || 'anonymous';
    currentGame.players[playerId] = 'completed';
    
    // Отправляем результат собеседнику
    if (window.socket) {
        window.socket.emit('game_action', {
            chatId: window.currentChat.id,
            gameType: currentGame.type,
            action: 'completed',
            playerId: playerId
        });
    }
    
    updateGameStatus();
    checkGameCompletion();
}

function skipTruthOrDare() {
    if (!currentGame) return;
    
    const playerId = window.vkUser?.id || 'anonymous';
    currentGame.players[playerId] = 'skipped';
    
    if (window.socket) {
        window.socket.emit('game_action', {
            chatId: window.currentChat.id,
            gameType: currentGame.type,
            action: 'skipped',
            playerId: playerId
        });
    }
    
    updateGameStatus();
    checkGameCompletion();
}

function showQuizGame(gameData) {
    let optionsHTML = '';
    gameData.question.options.forEach((option, index) => {
        optionsHTML += `<div class="game-option" onclick="answerQuiz(${index})">${option}</div>`;
    });
    
    const gameMessage = `
        <div class="game-question">❓ Викторина</div>
        <div>${gameData.question.question}</div>
        <div class="game-options">${optionsHTML}</div>
        <div class="game-stats">
            <span>${getPlayerName(1)}: ❓</span>
            <span>${getPlayerName(2)}: ❓</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
}

function answerQuiz(answerIndex) {
    if (!currentGame || currentGame.type !== 'quiz') return;
    
    const isCorrect = answerIndex === currentGame.data.question.correct;
    const playerId = window.vkUser?.id || 'anonymous';
    
    currentGame.players[playerId] = {
        answer: answerIndex,
        correct: isCorrect
    };
    
    // Отправляем ответ собеседнику
    if (window.socket) {
        window.socket.emit('game_action', {
            chatId: window.currentChat.id,
            gameType: currentGame.type,
            action: 'answered',
            playerId: playerId,
            answer: answerIndex,
            correct: isCorrect
        });
    }
    
    updateGameStatus();
    checkGameCompletion();
}

function showGuessWordGame(gameData) {
    const hiddenWord = '*'.repeat(gameData.word.word.length);
    
    const gameMessage = `
        <div class="game-question">🎯 Угадай слово</div>
        <div>Слово: <span id="hiddenWord">${hiddenWord}</span></div>
        <div>Подсказка: ${gameData.word.hint}</div>
        <div class="game-options">
            <input type="text" id="wordGuessInput" placeholder="Введите слово..." style="width: 100%; padding: 10px; border: 2px solid var(--border); border-radius: 10px; background: var(--background); color: var(--text);">
            <div class="game-option" onclick="guessWord()">🎯 Угадать</div>
        </div>
        <div class="game-stats">
            <span>Букв: ${gameData.word.word.length}</span>
            <span id="attemptsCount">Попытки: 3</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
    currentGame.attempts = 3;
    currentGame.word = gameData.word.word;
    currentGame.hiddenWord = hiddenWord;
}

function guessWord() {
    if (!currentGame || currentGame.type !== 'guessWord') return;
    
    const input = document.getElementById('wordGuessInput');
    if (!input) return;
    
    const guess = input.value.trim().toLowerCase();
    if (!guess) return;
    
    currentGame.attempts--;
    
    if (guess === currentGame.word.toLowerCase()) {
        // Правильный ответ
        const playerId = window.vkUser?.id || 'anonymous';
        currentGame.players[playerId] = 'winner';
        
        if (window.socket) {
            window.socket.emit('game_action', {
                chatId: window.currentChat.id,
                gameType: currentGame.type,
                action: 'guessed',
                playerId: playerId,
                word: currentGame.word
            });
        }
        
        endGameWithWinner(playerId, `🎉 ${getPlayerName(1)} угадал слово "${currentGame.word}"!`);
    } else {
        // Неправильный ответ
        updateGuessWordDisplay();
        
        if (currentGame.attempts <= 0) {
            endGameWithWinner(null, `❌ Никто не угадал слово "${currentGame.word}"`);
        }
    }
    
    input.value = '';
}

function updateGuessWordDisplay() {
    const attemptsElement = document.getElementById('attemptsCount');
    if (attemptsElement) {
        attemptsElement.textContent = `Попытки: ${currentGame.attempts}`;
    }
}

function showGuessEmotionGame(gameData) {
    const gameMessage = `
        <div class="game-question">😊 Угадай эмоцию</div>
        <div>Эмоция: <strong>${gameData.emotion.emotion}</strong></div>
        <div>${gameData.emotion.description}</div>
        <div>Покажите эту эмоцию жестами и мимикой!</div>
        <div class="game-options">
            <div class="game-option" onclick="emotionGuessed()">✅ Угадал эмоцию</div>
            <div class="game-option" onclick="skipEmotion()">❌ Не угадал</div>
        </div>
        <div class="game-stats">
            <span>Время: 60 сек</span>
        </div>
    `;
    
    sendGameMessage(gameMessage);
    
    // Запускаем таймер
    currentGame.timer = setTimeout(() => {
        if (currentGame && currentGame.type === 'guessEmotion') {
            endGameWithWinner(null, `⏰ Время вышло! Эмоция "${currentGame.data.emotion.emotion}" не угадана`);
        }
    }, 60000);
}

function emotionGuessed() {
    if (!currentGame || currentGame.type !== 'guessEmotion') return;
    
    const playerId = window.vkUser?.id || 'anonymous';
    currentGame.players[playerId] = 'guessed';
    
    if (window.socket) {
        window.socket.emit('game_action', {
            chatId: window.currentChat.id,
            gameType: currentGame.type,
            action: 'emotion_guessed',
            playerId: playerId,
            emotion: currentGame.data.emotion.emotion
        });
    }
    
    clearTimeout(currentGame.timer);
    endGameWithWinner(playerId, `🎉 ${getPlayerName(1)} угадал эмоцию "${currentGame.data.emotion.emotion}"!`);
}

function skipEmotion() {
    if (!currentGame || currentGame.type !== 'guessEmotion') return;
    
    const playerId = window.vkUser?.id || 'anonymous';
    currentGame.players[playerId] = 'skipped';
    
    if (window.socket) {
        window.socket.emit('game_action', {
            chatId: window.currentChat.id,
            gameType: currentGame.type,
            action: 'emotion_skipped',
            playerId: playerId
        });
    }
}

function updateGameStatus() {
    // Обновляем отображение статусов игроков в реальном времени
    const messages = document.querySelectorAll('.game-message');
    if (messages.length > 0) {
        const lastGameMessage = messages[messages.length - 1];
        // Можно добавить более сложную логику обновления статусов
    }
}

function checkGameCompletion() {
    if (!currentGame) return;
    
    const playerCount = Object.keys(currentGame.players).length;
    
    if (playerCount === 2) {
        // Оба игрока сделали ход
        setTimeout(() => endGame(), 1000);
    }
}

function endGame() {
    if (!currentGame) return;
    
    let resultMessage = "🎮 Игра завершена!\n";
    let player1Result = "❓";
    let player2Result = "❓";
    
    Object.keys(currentGame.players).forEach(playerId => {
        const result = currentGame.players[playerId];
        const isCurrentUser = playerId === (window.vkUser?.id || 'anonymous');
        
        if (isCurrentUser) {
            player1Result = getResultEmoji(result);
        } else {
            player2Result = getResultEmoji(result);
        }
    });
    
    resultMessage += `${getPlayerName(1)}: ${player1Result}\n`;
    resultMessage += `${getPlayerName(2)}: ${player2Result}`;
    
    sendGameMessage(resultMessage);
    currentGame = null;
    
    // Начисляем опыт
    addXP(15);
    userStats.gamesPlayed++;
    saveUserStats();
    updateProfileStats();
}

function getResultEmoji(result) {
    if (result === 'completed' || result === 'guessed' || (result.correct && result.correct === true)) {
        return '✅';
    } else if (result === 'skipped' || (result.correct && result.correct === false)) {
        return '❌';
    } else if (result === 'winner') {
        return '🏆';
    }
    return '❓';
}

function endGameWithWinner(winnerId, message) {
    sendGameMessage(message);
    
    if (winnerId) {
        addXP(20);
    } else {
        addXP(5);
    }
    
    userStats.gamesPlayed++;
    saveUserStats();
    updateProfileStats();
    currentGame = null;
}

function sendGameMessage(content) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message game-message';
    messageElement.innerHTML = content;
    
    if (container.innerHTML.includes('Пока нет сообщений') || container.innerHTML.includes('Загружаем чат')) {
        container.innerHTML = '';
    }
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

// ===== ОСНОВНОЙ ФУНКЦИОНАЛ =====
async function initApp() {
    console.log('🚀 Инициализация приложения с играми...');
    
    try {
        if (typeof vkBridge !== 'undefined') {
            await vkBridge.send('VKWebAppInit');
            isVK = true;
            const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
            window.vkUser = userInfo;
            updateUserInterface(userInfo);
            showNotification('Добро пожаловать, ' + userInfo.first_name + '! 🎮');
        } else {
            throw new Error('VK Bridge not available');
        }
    } catch (error) {
        console.log('Приложение запущено вне VK:', error.message);
        isVK = false;
        window.vkUser = { 
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            first_name: 'Аноним',
            last_name: ''
        };
        updateUserInterface(window.vkUser);
        showNotification('Анонимный режим - можно создавать чаты и играть! 🎮');
    }

    initThemeSystem();
    await loadSocketIO();
    initSocketConnection();
    
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    updateAchievementsDisplay();
    setupEventListeners();
    
    console.log('✅ Приложение с играми инициализировано');
}

// Socket.io функции (остаются без изменений)
async function loadSocketIO() {
    return new Promise((resolve) => {
        if (typeof io !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
        script.onload = () => resolve();
        script.onerror = () => resolve();
        document.head.appendChild(script);
    });
}

function initSocketConnection() {
    try {
        if (typeof io === 'undefined') {
            console.error('❌ Socket.io не доступен');
            return;
        }

        console.log('🔌 Инициализация Socket.io подключения...');
        window.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 10000
        });
        
        window.socket.on('connect', () => {
            console.log('✅ Подключен к серверу чатов');
            if (window.vkUser?.id) {
                window.socket.emit('set_user_id', window.vkUser.id);
            }
        });
        
        setupSocketHandlers();
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Socket.io:', error);
    }
}

function setupSocketHandlers() {
    if (!window.socket) return;

    // Обработчики игр
    window.socket.on('game_invite', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            showGameInvite(data);
        }
    });
    
    window.socket.on('game_start', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            startGameLocally(data.gameType, data.gameData);
        }
    });
    
    window.socket.on('game_action', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id && currentGame) {
            handleGameAction(data);
        }
    });

    // Обработчики чата (остаются без изменений)
    window.socket.on('chat_messages', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            renderMessages(data.messages);
        }
    });
    
    window.socket.on('new_chat_created', (chat) => {
        const isMyChat = chat.user_id === window.vkUser?.id;
        const existingChatIndex = allChats.findIndex(c => c.id === chat.id);
        
        if (existingChatIndex === -1) {
            addChatToList(chat);
        }
    });
    
    window.socket.on('chat_activated', (data) => {
        removeChatFromList(data.chatId);
        
        if (window.currentChat && data.chatId === window.currentChat.id) {
            showNotification('💬 Найден собеседник! Можно играть! 🎮');
            onlineUsers = new Set([window.vkUser?.id, 'partner']);
            updateOnlineCount();
        }
        
        if (waitingChatId === data.chatId) {
            showScreen('chatRoomScreen');
            waitingChatId = null;
        }
    });
    
    window.socket.on('user_joined', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers.add(data.userId);
            updateOnlineCount();
        }
    });
    
    window.socket.on('user_left', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers.delete(data.userId);
            updateOnlineCount();
        }
    });
    
    window.socket.on('new_message', (message) => {
        if (window.currentChat && message.chat_id === window.currentChat.id) {
            addMessageToChat(message);
        }
    });
    
    window.socket.on('typing_start', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.style.display = 'inline';
            }
        }
    });
    
    window.socket.on('typing_stop', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.style.display = 'none';
            }
        }
    });
    
    window.socket.on('online_users', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers = new Set(data.users);
            updateOnlineCount();
        }
    });
}

function showGameInvite(data) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 300px;">
            <div class="modal-header">
                <div class="modal-title">🎮 Приглашение в игру</div>
            </div>
            <div style="padding: 16px;">
                <div style="font-size: 48px; margin-bottom: 16px;">${getGameEmoji(data.gameType)}</div>
                <p style="margin-bottom: 8px; font-weight: 600;">${getGameName(data.gameType)}</p>
                <p style="margin-bottom: 16px; color: var(--text-secondary);">Собеседник предлагает сыграть в эту игру</p>
                <div style="display: flex; flex-direction: column; gap: 10px; align-items: center;">
                    <button class="action-button" onclick="acceptGameInvite('${data.gameType}')" style="width: 100%;">
                        ✅ Принять вызов
                    </button>
                    <button class="action-button secondary" onclick="declineGameInvite()" style="width: 100%;">
                        ❌ Отклонить
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function getGameEmoji(gameType) {
    const emojis = {
        'truthOrDare': '🎲',
        'quiz': '❓',
        'guessWord': '🎯',
        'guessEmotion': '😊'
    };
    return emojis[gameType] || '🎮';
}

function getGameName(gameType) {
    const names = {
        'truthOrDare': 'Правда или Действие',
        'quiz': 'Викторина',
        'guessWord': 'Угадай слово',
        'guessEmotion': 'Угадай эмоцию'
    };
    return names[gameType] || 'Игра';
}

function declineGameInvite() {
    closeAllModals();
    showNotification('❌ Вы отклонили приглашение в игру');
}

function handleGameAction(data) {
    if (!currentGame) return;
    
    const playerId = data.playerId;
    
    switch (data.action) {
        case 'completed':
        case 'skipped':
        case 'answered':
        case 'guessed':
        case 'emotion_guessed':
        case 'emotion_skipped':
            currentGame.players[playerId] = data.answer || data.action;
            updateGameStatus();
            checkGameCompletion();
            break;
    }
}

// Остальные функции (обновление интерфейса, работа с чатами, достижения)
// остаются такими же как в предыдущей версии

// ... [остальной код без изменений] ...

// Запуск приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, запускаем приложение с играми...');
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
window.openThemeSettings = openThemeSettings;
window.closeThemeModal = closeThemeModal;
window.selectTheme = selectTheme;
window.cancelWaiting = cancelWaiting;
window.modifySearch = modifySearch;
window.openGamesMenu = openGamesMenu;
window.closeGamesMenu = closeGamesMenu;
window.startGame = startGame;
window.acceptGameInvite = acceptGameInvite;
window.declineGameInvite = declineGameInvite;
window.completeTruthOrDare = completeTruthOrDare;
window.skipTruthOrDare = skipTruthOrDare;
window.answerQuiz = answerQuiz;
window.guessWord = guessWord;
window.emotionGuessed = emotionGuessed;
window.skipEmotion = skipEmotion;
