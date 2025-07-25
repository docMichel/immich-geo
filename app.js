/**
 * APP.JS - Orchestration principale de l'application
 * 
 * Ce fichier coordonne tous les modules et gère :
 * - L'initialisation de l'application
 * - Les événements globaux
 * - La navigation par dates
 * - Les interactions utilisateur
 * - La coordination entre modules
 */

class ImmichGPSApp {
    constructor() {
        this.timeBuckets = [];
        this.currentPeriod = null;
        this.isInitialized = false;
    }

    /**
     * Initialise l'application
     */
    async Xinit() {
        console.log('🚀 Initialisation de l\'application Immich GPS Manager');

        try {
            // Vérifier la connectivité API
            ui.showMessage('Vérification de la connexion à Immich...', 'info');
            const isConnected = await immichAPI.testConnection();

            if (!isConnected) {
                ui.showMessage('Impossible de se connecter à l\'API Immich', 'error');
                return;
            }

            // Initialiser les gestionnaires d'événements
            this.initEventListeners();

            // Initialiser l'interface
            this.initUI();

            this.isInitialized = true;
            ui.showMessage('✅ Application initialisée avec succès', 'success');

            console.log('✅ Application prête');

        } catch (error) {
            console.error('❌ Erreur d\'initialisation:', error);
            ui.showMessage(`Erreur d'initialisation: ${error.message}`, 'error');
        }
    }

    async init() {
        console.log('🚀 Initialisation de l\'application Immich GPS Manager');

        try {
            // Vérifier la connectivité API avec authentification
            ui.showMessage('Vérification de la connexion à Immich...', 'info');

            // Charger le token depuis localStorage
            immichAPI.loadApiKey();

            const isConnected = await immichAPI.testConnection();

            if (!isConnected) {
                ui.showMessage('Impossible de se connecter à l\'API Immich', 'error');
                return;
            }

            // Initialiser les gestionnaires d'événements
            this.initEventListeners();

            // Initialiser l'interface
            this.initUI();

            this.isInitialized = true;
            ui.showMessage('✅ Application initialisée avec succès', 'success');

            console.log('✅ Application prête');

        } catch (error) {
            console.error('❌ Erreur d\'initialisation:', error);
            if (error.message.includes('Authentification')) {
                ui.showMessage('Authentification requise. Veuillez fournir votre token d\'API Immich.', 'warning');
            } else {
                ui.showMessage(`Erreur d'initialisation: ${error.message}`, 'error');
            }
        }
    }
    /**
     * Initialise les gestionnaires d'événements
     */
    initEventListeners() {
        // Navigation par dates
        document.getElementById('loadPeriodsBtn').addEventListener('click', () => {
            this.loadTimeBuckets();
        });

        document.getElementById('yearSelect').addEventListener('change', (e) => {
            this.onYearChange(e.target.value);
        });

        document.getElementById('monthSelect').addEventListener('change', (e) => {
            this.onMonthChange(e.target.value);
        });

        document.getElementById('loadPhotosBtn').addEventListener('click', () => {
            this.loadPhotosForSelectedPeriod();
        });

        // Contrôles des photos
        document.getElementById('analyzeGpsBtn').addEventListener('click', () => {
            photosManager.analyzeAllGPS();
        });

        document.getElementById('copyModeBtn').addEventListener('click', () => {
            gpsManager.toggleCopyMode();
        });

        document.getElementById('pasteModeBtn').addEventListener('click', () => {
            gpsManager.togglePasteMode();
        });

        document.getElementById('changeTokenBtn')?.addEventListener('click', () => {
            localStorage.removeItem('immich_api_key');
            immichAPI.setApiKey(null);
            ui.showMessage('Token supprimé. Rechargez la page pour vous reconnecter.', 'info');
        });


        // Filtres
        document.querySelectorAll('.btn-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                photosManager.setFilter(filter);
            });
        });

        // Pagination
        document.getElementById('prevPageBtn').addEventListener('click', () => {
            photosManager.previousPage();
        });

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            photosManager.nextPage();
        });

        // Exports
        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            photosManager.exportToCSV();
        });

        document.getElementById('exportJsonBtn').addEventListener('click', () => {
            photosManager.exportToJSON();
        });

        document.getElementById('exportKmlBtn').addEventListener('click', () => {
            photosManager.exportToKML();
        });

        // Délégation d'événements pour les cartes photo (chargées dynamiquement)
        document.getElementById('photosGrid').addEventListener('click', (e) => {
            const photoCard = e.target.closest('.photo-card');
            if (photoCard && !e.target.classList.contains('gps-info')) {
                // Créer un événement personnalisé pour la carte
                const customEvent = {
                    currentTarget: photoCard,
                    target: e.target,
                    preventDefault: e.preventDefault.bind(e),
                    stopPropagation: e.stopPropagation.bind(e)
                };

                const photoId = photoCard.dataset.photoId;
                if (photoId) {
                    gpsManager.handlePhotoClick(photoId);
                }
            }
        });

        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });

        // Gestion de l'état de la fenêtre
        window.addEventListener('beforeunload', () => {
            this.saveAppState();
        });

        console.log('📋 Gestionnaires d\'événements initialisés');
    }

    /**
     * Initialise l'interface utilisateur
     */
    initUI() {
        // Masquer toutes les sections sauf la navigation
        ui.toggleSection('dateSelectors', false);
        ui.toggleSection('periodInfo', false);
        ui.toggleSection('statsSection', false);
        ui.toggleSection('photoControls', false);
        ui.toggleSection('photosSection', false);
        ui.toggleSection('exportSection', false);

        // Désactiver les boutons initialement
        ui.toggleButton('loadPhotosBtn', false);
        ui.toggleButton('analyzeGpsBtn', false);
        ui.toggleButton('pasteModeBtn', false);

        // Restaurer l'état précédent si disponible
        this.restoreAppState();

        console.log('🎨 Interface utilisateur initialisée');
    }

    /**
     * Charge les buckets de timeline
     */
    async loadTimeBuckets() {
        try {
            ui.toggleButton('loadPeriodsBtn', false, '🔄 Chargement...');
            ui.showMessage('Chargement des périodes disponibles...', 'info');

            this.timeBuckets = await immichAPI.getTimeBuckets();

            if (this.timeBuckets.length === 0) {
                ui.showMessage('Aucune période trouvée', 'warning');
                return;
            }

            // Mettre à jour les sélecteurs
            ui.updateDateSelectors(this.timeBuckets);

            ui.showMessage(`${this.timeBuckets.length} périodes chargées`, 'success');

        } catch (error) {
            console.error('Erreur chargement périodes:', error);
            ui.showMessage(`Erreur: ${error.message}`, 'error');
        } finally {
            ui.toggleButton('loadPeriodsBtn', true, '🔄 Charger les périodes disponibles');
        }
    }

    /**
     * Gère le changement d'année
     * @param {string} year - Année sélectionnée
     */
    onYearChange(year) {
        if (!year) {
            this.currentPeriod = null;
            ui.toggleButton('loadPhotosBtn', false);
            return;
        }

        this.currentPeriod = { year };

        // Mettre à jour le sélecteur de mois
        ui.updateMonthSelector(this.timeBuckets, year);

        console.log('Année sélectionnée:', year);
    }

    /**
     * Gère le changement de mois
     * @param {string} month - Mois sélectionné
     */
    onMonthChange(month) {
        if (!this.currentPeriod) return;

        if (month) {
            this.currentPeriod.month = month;
        } else {
            // "Toute l'année" sélectionnée
            delete this.currentPeriod.month;
        }

        ui.toggleButton('loadPhotosBtn', true);

        console.log('Période sélectionnée:', this.currentPeriod);
    }

    /**
     * Charge les photos de la période sélectionnée
     */
    async loadPhotosForSelectedPeriod() {
        if (!this.currentPeriod) {
            ui.showMessage('Veuillez sélectionner une période', 'warning');
            return;
        }

        try {
            ui.toggleButton('loadPhotosBtn', false, '🔄 Chargement...');

            // Effacer les photos précédentes
            photosManager.clearPhotos();
            gpsManager.resetModes();

            // Charger les nouvelles photos
            await photosManager.loadPhotosForPeriod(this.currentPeriod);

            // Activer les contrôles
            ui.toggleButton('analyzeGpsBtn', true);

            console.log('Photos chargées pour:', this.currentPeriod);

        } catch (error) {
            console.error('Erreur chargement photos:', error);
            ui.showMessage(`Erreur: ${error.message}`, 'error');
        } finally {
            ui.toggleButton('loadPhotosBtn', true, '📥 Charger les photos de cette période');
        }
    }

    /**
     * Gère les raccourcis clavier
     * @param {KeyboardEvent} e - Événement clavier
     */
    handleKeyboardShortcuts(e) {
        // Ignorer si on tape dans un input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'c':
                if (e.ctrlKey || e.metaKey) return; // Ctrl+C natif
                gpsManager.toggleCopyMode();
                e.preventDefault();
                break;

            case 'v':
                if (e.ctrlKey || e.metaKey) return; // Ctrl+V natif
                gpsManager.togglePasteMode();
                e.preventDefault();
                break;

            case 'escape':
                gpsManager.resetModes();
                e.preventDefault();
                break;

            case 'a':
                if (e.ctrlKey || e.metaKey) return; // Ctrl+A natif
                photosManager.analyzeAllGPS();
                e.preventDefault();
                break;

            case 'arrowleft':
                photosManager.previousPage();
                e.preventDefault();
                break;

            case 'arrowright':
                photosManager.nextPage();
                e.preventDefault();
                break;
        }
    }

    /**
     * Sauvegarde l'état de l'application
     */
    saveAppState() {
        try {
            const state = {
                currentPeriod: this.currentPeriod,
                photosState: photosManager.getState(),
                gpsState: gpsManager.getState(),
                timestamp: Date.now()
            };

            localStorage.setItem('immich_gps_app_state', JSON.stringify(state));
            console.log('État de l\'application sauvegardé');

        } catch (error) {
            console.warn('Impossible de sauvegarder l\'état:', error);
        }
    }

    /**
     * Restaure l'état de l'application
     */
    restoreAppState() {
        try {
            const savedState = localStorage.getItem('immich_gps_app_state');
            if (!savedState) return;

            const state = JSON.parse(savedState);

            // Vérifier que l'état n'est pas trop ancien (24h)
            const ageHours = (Date.now() - state.timestamp) / (1000 * 60 * 60);
            if (ageHours > 24) {
                localStorage.removeItem('immich_gps_app_state');
                return;
            }

            // Restaurer la période si disponible
            if (state.currentPeriod) {
                this.currentPeriod = state.currentPeriod;
            }

            console.log('État de l\'application restauré');

        } catch (error) {
            console.warn('Impossible de restaurer l\'état:', error);
            localStorage.removeItem('immich_gps_app_state');
        }
    }

    /**
     * Exporte un rapport complet de l'état
     */
    exportStatusReport() {
        const report = {
            timestamp: new Date().toISOString(),
            app: {
                initialized: this.isInitialized,
                currentPeriod: this.currentPeriod,
                timeBucketsLoaded: this.timeBuckets.length
            },
            photos: photosManager.getDetailedStats(),
            gps: gpsManager.getState(),
            browser: {
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform
            }
        };

        const json = JSON.stringify(report, null, 2);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `immich_gps_report_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        ui.showMessage('Rapport d\'état exporté', 'success');

        return report;
    }

    /**
     * Réinitialise complètement l'application
     */
    reset() {
        // Effacer les données
        this.timeBuckets = [];
        this.currentPeriod = null;

        // Réinitialiser les modules
        photosManager.clearPhotos();
        gpsManager.resetModes();
        gpsManager.clearClipboard();

        // Réinitialiser l'interface
        this.initUI();

        // Effacer le localStorage
        localStorage.removeItem('immich_gps_app_state');
        localStorage.removeItem('gps_actions');

        ui.showMessage('Application réinitialisée', 'info');

        console.log('🔄 Application réinitialisée');
    }

    /**
     * Retourne l'état complet de l'application
     * @returns {object} - État complet
     */
    getFullState() {
        return {
            app: {
                initialized: this.isInitialized,
                currentPeriod: this.currentPeriod,
                timeBucketsCount: this.timeBuckets.length
            },
            photos: photosManager.getDetailedStats(),
            gps: gpsManager.getState()
        };
    }
}

// Création de l'instance globale
const app = new ImmichGPSApp();

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// Export pour usage global
window.immichGPSApp = app;

// Fonctions utilitaires globales pour le debug
window.debugApp = {
    getState: () => app.getFullState(),
    exportReport: () => app.exportStatusReport(),
    reset: () => app.reset(),
    testAPI: () => immichAPI.testConnection(),
    clearStorage: () => {
        localStorage.removeItem('immich_gps_app_state');
        localStorage.removeItem('gps_actions');
        console.log('Storage effacé');
    }
};

console.log('📱 Application Immich GPS Manager chargée');
console.log('💡 Utilisez window.debugApp pour les outils de debug');
console.log('⌨️ Raccourcis: C=Copie, V=Colle, A=Analyser, Échap=Reset modes, ←→=Navigation');
