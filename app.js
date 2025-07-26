/**
 * APP.JS - Application principale (VERSION PROPRE)
 */

class App {
    constructor() {
        this.timeBuckets = [];
        this.currentPeriod = null;
        this.photos = [];
    }

    /**
     * Initialise l'application
     */
    async init() {
        console.log('🚀 Initialisation de l\'application');
        
        try {
            // Test de connexion
            ui.showMessage('Test de connexion à Immich...', 'info');
            const isConnected = await api.testConnection();
            
            if (!isConnected) {
                ui.showMessage('Connexion à Immich échouée', 'error');
                return;
            }

            // Initialiser les événements
            this.initEvents();
            
            ui.showMessage('✅ Application initialisée', 'success');
            
        } catch (error) {
            console.error('Erreur d\'initialisation:', error);
            ui.showMessage(`Erreur: ${error.message}`, 'error');
        }
    }

    /**
     * Initialise les événements
     */
    initEvents() {
        // Charger les périodes
        document.getElementById('loadPeriodsBtn').addEventListener('click', () => {
            this.loadPeriods();
        });

        // Sélecteur d'année
        document.getElementById('yearSelect').addEventListener('change', (e) => {
            this.selectYear(e.target.value);
        });

        // Sélecteur de mois
        document.getElementById('monthSelect').addEventListener('change', (e) => {
            this.selectMonth(e.target.value);
        });

        // Charger les photos
        document.getElementById('loadPhotosBtn').addEventListener('click', () => {
            this.loadPhotos();
        });

        console.log('✅ Événements initialisés');
    }

    /**
     * Charge les périodes disponibles
     */
    async loadPeriods() {
        try {
            ui.toggleButton('loadPeriodsBtn', false, 'Chargement...');
            ui.showMessage('Chargement des périodes...', 'info');

            this.timeBuckets = await api.getTimeBuckets();
            
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
     * Sélectionne une année
     */
    selectYear(year) {
        if (!year) {
            this.currentPeriod = null;
            ui.toggleButton('loadPhotosBtn', false);
            return;
        }

        this.currentPeriod = { year };
        ui.updateMonthSelector(this.timeBuckets, year);
        
        console.log('Année sélectionnée:', year);
    }

    /**
     * Sélectionne un mois
     */
    selectMonth(month) {
        if (!this.currentPeriod) return;

        if (month) {
            this.currentPeriod.month = month;
        } else {
            delete this.currentPeriod.month;
        }

        ui.toggleButton('loadPhotosBtn', true);
        console.log('Période sélectionnée:', this.currentPeriod);
    }

    /**
     * Charge les photos de la période
     */
    async loadPhotos() {
        if (!this.currentPeriod) {
            ui.showMessage('Sélectionnez une période', 'warning');
            return;
        }

        try {
            ui.toggleButton('loadPhotosBtn', false, 'Chargement...');
            ui.showMessage('Chargement des photos...', 'info');

            // Rechercher les photos par pages
            this.photos = [];
            let page = 1;
            let hasMore = true;

            while (hasMore && page <= 10) {
                ui.updateProgress((page - 1) * 10, `Page ${page}...`, true);

                const result = await api.searchPhotos({ page, size: 1000 });
                
                if (result.photos.length === 0) {
                    hasMore = false;
                    break;
                }

                // Filtrer par période
                const periodPhotos = this.filterPhotosByPeriod(result.photos);
                this.photos = this.photos.concat(periodPhotos);

                hasMore = result.hasMore;
                page++;
            }

            ui.updateProgress(0, '', false);
            
            // Afficher les statistiques
            ui.updateStats({
                total: this.photos.length,
                analyzed: 0,
                withGPS: 0
            });

            ui.toggleSection('statsSection', true);
            ui.showMessage(`${this.photos.length} photos chargées`, 'success');

        } catch (error) {
            console.error('Erreur chargement photos:', error);
            ui.showMessage(`Erreur: ${error.message}`, 'error');
            ui.updateProgress(0, '', false);
        } finally {
            ui.toggleButton('loadPhotosBtn', true, '📥 Charger les photos de ce mois');
        }
    }

    /**
     * Filtre les photos par période
     */
    filterPhotosByPeriod(photos) {
        const { year, month } = this.currentPeriod;

        return photos.filter(photo => {
            try {
                const photoDate = new Date(photo.fileCreatedAt || photo.localDateTime);
                const photoYear = photoDate.getFullYear().toString();

                if (photoYear !== year) return false;

                if (month) {
                    const photoMonth = (photoDate.getMonth() + 1).toString().padStart(2, '0');
                    return photoMonth === month;
                }

                return true;

            } catch (error) {
                return false;
            }
        });
    }
}

// Instance globale unique
const app = new App();

// APRÈS
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app.init();
    });
} else {
    // DOM déjà prêt
    app.init();
}

console.log('📱 Application chargée');