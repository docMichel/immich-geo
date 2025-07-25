/**
 * UI.JS - Gestion de l'interface utilisateur
 * 
 * Ce fichier gère tous les aspects de l'interface :
 * - Messages de notification
 * - Barres de progression
 * - Mise à jour des statistiques
 * - Affichage des éléments
 * - Gestion des événements UI
 */

class UIManager {
    constructor() {
        this.messageContainer = document.getElementById('messageContainer');
        this.currentMessages = new Set();
        this.maxMessages = 5;
    }

    /**
     * Affiche un message de notification
     * @param {string} text - Texte du message
     * @param {string} type - Type: success, error, info, warning
     * @param {number} duration - Durée d'affichage en ms (défaut: 3000)
     */
    showMessage(text, type = 'info', duration = 3000) {
        // Limiter le nombre de messages
        if (this.currentMessages.size >= this.maxMessages) {
            const oldestMessage = this.messageContainer.firstChild;
            if (oldestMessage) {
                this.removeMessage(oldestMessage);
            }
        }

        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = text;
        
        // Ajouter icône selon le type
        const icon = this.getMessageIcon(type);
        messageEl.innerHTML = `${icon} ${text}`;
        
        this.messageContainer.appendChild(messageEl);
        this.currentMessages.add(messageEl);
        
        // Supprimer automatiquement après la durée
        setTimeout(() => {
            this.removeMessage(messageEl);
        }, duration);
        
        console.log(`${type.toUpperCase()}: ${text}`);
    }

    /**
     * Supprime un message
     * @param {HTMLElement} messageEl - Élément message à supprimer
     */
    removeMessage(messageEl) {
        if (messageEl && messageEl.parentNode) {
            messageEl.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (messageEl.parentNode) {
                    messageEl.parentNode.removeChild(messageEl);
                    this.currentMessages.delete(messageEl);
                }
            }, 300);
        }
    }

    /**
     * Retourne l'icône appropriée pour le type de message
     * @param {string} type - Type de message
     * @returns {string} - Icône emoji
     */
    getMessageIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    }

    /**
     * Met à jour la barre de progression
     * @param {number} percent - Pourcentage (0-100)
     * @param {string} text - Texte descriptif
     * @param {boolean} show - Afficher/masquer la barre
     */
    updateProgress(percent = 0, text = '', show = true) {
        const container = document.getElementById('progressContainer');
        const fill = document.getElementById('progressFill');
        const textEl = document.getElementById('progressText');
        
        if (show && percent > 0) {
            container.style.display = 'block';
            fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
            textEl.textContent = text || `${Math.round(percent)}%`;
        } else if (!show || percent === 0) {
            container.style.display = 'none';
        }
    }

    /**
     * Met à jour les statistiques
     * @param {object} stats - Objet avec les statistiques
     */
    updateStats(stats) {
        const elements = {
            totalPhotos: stats.total || 0,
            analyzedPhotos: stats.analyzed || 0,
            gpsPhotos: stats.withGPS || 0,
            noGpsPhotos: (stats.analyzed || 0) - (stats.withGPS || 0)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                // Animation du changement de nombre
                this.animateNumber(el, parseInt(el.textContent) || 0, value);
            }
        });
    }

    /**
     * Anime le changement d'un nombre
     * @param {HTMLElement} element - Élément à animer
     * @param {number} from - Valeur de départ
     * @param {number} to - Valeur d'arrivée
     */
    animateNumber(element, from, to) {
        if (from === to) return;
        
        const duration = 500;
        const steps = 20;
        const stepValue = (to - from) / steps;
        const stepDuration = duration / steps;
        
        let current = from;
        let step = 0;
        
        const interval = setInterval(() => {
            step++;
            current += stepValue;
            
            if (step >= steps) {
                element.textContent = to;
                clearInterval(interval);
            } else {
                element.textContent = Math.round(current);
            }
        }, stepDuration);
    }

    /**
     * Affiche/masque une section
     * @param {string} sectionId - ID de la section
     * @param {boolean} show - Afficher ou masquer
     */
    toggleSection(sectionId, show) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Active/désactive un bouton
     * @param {string} buttonId - ID du bouton
     * @param {boolean} enabled - Activer ou désactiver
     * @param {string} text - Nouveau texte (optionnel)
     */
    toggleButton(buttonId, enabled, text = null) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = !enabled;
            if (text) {
                button.textContent = text;
            }
        }
    }

    /**
     * Met à jour les sélecteurs de date
     * @param {Array} timeBuckets - Buckets de timeline
     */
    updateDateSelectors(timeBuckets) {
        // Grouper par année
        const yearGroups = {};
        timeBuckets.forEach(bucket => {
            const year = bucket.timeBucket.substring(0, 4);
            if (!yearGroups[year]) {
                yearGroups[year] = { count: 0, months: new Set() };
            }
            yearGroups[year].count += bucket.count;
            yearGroups[year].months.add(bucket.timeBucket.substring(5, 7));
        });

        // Remplir le sélecteur d'années
        const yearSelect = document.getElementById('yearSelect');
        const years = Object.keys(yearGroups).sort().reverse();
        
        yearSelect.innerHTML = '<option value="">Sélectionner une année...</option>' +
            years.map(year => 
                `<option value="${year}">${year} (${yearGroups[year].count} photos)</option>`
            ).join('');
        
        yearSelect.disabled = false;
        
        // Afficher les informations
        const info = `${timeBuckets.length} périodes disponibles (${years[0]} - ${years[years.length-1]})`;
        document.getElementById('periodInfo').innerHTML = info;
        this.toggleSection('periodInfo', true);
        this.toggleSection('dateSelectors', true);
    }

    /**
     * Met à jour les mois disponibles pour une année
     * @param {Array} timeBuckets - Buckets de timeline
     * @param {string} selectedYear - Année sélectionnée
     */
    updateMonthSelector(timeBuckets, selectedYear) {
        const monthSelect = document.getElementById('monthSelect');
        
        if (!selectedYear) {
            monthSelect.innerHTML = '<option value="">Sélectionner un mois...</option>';
            monthSelect.disabled = true;
            this.toggleButton('loadPhotosBtn', false);
            return;
        }

        // Trouver les mois pour cette année
        const monthsInYear = timeBuckets
            .filter(bucket => bucket.timeBucket.startsWith(selectedYear + '-'))
            .map(bucket => {
                const month = bucket.timeBucket.substring(5, 7);
                return {
                    value: month,
                    name: this.getMonthName(month),
                    count: bucket.count,
                    fullDate: bucket.timeBucket
                };
            })
            .sort((a, b) => b.value.localeCompare(a.value)); // Plus récents en premier

        monthSelect.innerHTML = '<option value="">Toute l\'année</option>' +
            monthsInYear.map(month => 
                `<option value="${month.value}">${month.name} ${selectedYear} (${month.count} photos)</option>`
            ).join('');
        
        monthSelect.disabled = false;
        this.toggleButton('loadPhotosBtn', true);

        // Calculer total année
        const yearTotal = monthsInYear.reduce((sum, month) => sum + month.count, 0);
        const info = `Année ${selectedYear} : ${yearTotal} photos au total`;
        document.getElementById('periodInfo').innerHTML = info;
    }

    /**
     * Retourne le nom du mois
     * @param {string} monthNum - Numéro du mois (01-12)
     * @returns {string} - Nom du mois
     */
    getMonthName(monthNum) {
        const months = [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        return months[parseInt(monthNum) - 1] || monthNum;
    }

    /**
     * Affiche la grille de photos
     * @param {Array} photos - Liste des photos
     * @param {object} options - Options d'affichage
     */
    displayPhotos(photos, options = {}) {
        const {
            filter = 'all',
            currentPage = 1,
            photosPerPage = 50,
            copyMode = false,
            pasteMode = false
        } = options;

        // Filtrer les photos
        let filteredPhotos = this.filterPhotos(photos, filter);
        
        // Pagination
        const startIndex = (currentPage - 1) * photosPerPage;
        const endIndex = startIndex + photosPerPage;
        const pagePhotos = filteredPhotos.slice(startIndex, endIndex);
        
        // Générer HTML
        const grid = document.getElementById('photosGrid');
        grid.innerHTML = pagePhotos.map(photo => 
            this.generatePhotoCard(photo, { copyMode, pasteMode })
        ).join('');
        
        // Mettre à jour la pagination
        this.updatePagination(filteredPhotos.length, currentPage, photosPerPage);
        
        // Afficher la section
        this.toggleSection('photosSection', true);
    }

    /**
     * Filtre les photos selon le critère
     * @param {Array} photos - Photos à filtrer
     * @param {string} filter - Critère: all, gps, no-gps
     * @returns {Array} - Photos filtrées
     */
    filterPhotos(photos, filter) {
        switch (filter) {
            case 'gps':
                return photos.filter(p => p.hasGPS);
            case 'no-gps':
                return photos.filter(p => p.analyzed && !p.hasGPS);
            default:
                return photos;
        }
    }

    /**
     * Génère le HTML d'une carte photo
     * @param {object} photo - Données de la photo
     * @param {object} options - Options d'affichage
     * @returns {string} - HTML de la carte
     */
    generatePhotoCard(photo, options = {}) {
        const { copyMode, pasteMode } = options;
        const date = new Date(photo.fileCreatedAt).toLocaleDateString('fr-FR');
        
        // Classes CSS
        const cardClasses = [
            'photo-card',
            photo.hasGPS ? 'has-gps' : 'no-gps',
            copyMode ? 'copy-mode' : '',
            pasteMode ? 'paste-mode' : ''
        ].filter(Boolean).join(' ');

        // Statut de la photo
        let statusHTML = '';
        if (!photo.analyzed) {
            statusHTML = '<div class="photo-status status-analyzing">⏳ Analyse...</div>';
        } else if (photo.hasGPS) {
            statusHTML = '<div class="photo-status status-gps">📍 GPS</div>';
        } else {
            statusHTML = '<div class="photo-status status-no-gps">❌ Pas GPS</div>';
        }

        // Indicateurs de mode
        let modeIndicator = '';
        if (copyMode && photo.hasGPS) {
            modeIndicator = '<div class="mode-indicator copy-indicator">📋 COPIER</div>';
        } else if (pasteMode && !photo.hasGPS) {
            modeIndicator = '<div class="mode-indicator paste-indicator">📍 COLLER</div>';
        }

        // Thumbnail avec gestion d'erreur
        const thumbnailHTML = `
            <div style="width: 100%; height: 150px; overflow: hidden; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
                <img src="${photo.thumbnailUrl}" 
                     alt="${photo.filename}" 
                     style="max-width: 100%; max-height: 100%; object-fit: cover;"
                     onerror="this.style.display='none'; this.parentNode.innerHTML='<div style=\\'color: #999; text-align: center; padding: 20px;\\'>📷<br>Image</div>';">
            </div>
        `;

        // Informations GPS
        let gpsHTML = '';
        if (photo.hasGPS && photo.gpsData) {
            const { latitude, longitude, country, city } = photo.gpsData;
            gpsHTML = `
                <div class="gps-info" onclick="copyGPSCoordinates(${latitude}, ${longitude})">
                    📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}<br>
                    🌍 ${country} - ${city}<br>
                    <small>Cliquer pour copier</small>
                </div>
            `;
        } else if (photo.analyzed) {
            gpsHTML = '<div class="no-gps-info">❌ Aucune coordonnée GPS trouvée</div>';
        } else {
            gpsHTML = '<div class="no-gps-info">⏳ En attente d\'analyse...</div>';
        }

        return `
            <div class="${cardClasses}" data-photo-id="${photo.id}" onclick="handlePhotoCardClick(event)">
                ${statusHTML}
                ${modeIndicator}
                
                ${thumbnailHTML}
                
                <div class="photo-header">
                    <div class="photo-name" title="${photo.filename}">${photo.filename}</div>
                    <div class="photo-date">📅 ${date}</div>
                </div>
                
                <div class="photo-content">
                    ${gpsHTML}
                </div>
            </div>
        `;
    }

    /**
     * Met à jour la pagination
     * @param {number} totalPhotos - Nombre total de photos
     * @param {number} currentPage - Page actuelle
     * @param {number} photosPerPage - Photos par page
     */
    updatePagination(totalPhotos, currentPage, photosPerPage) {
        const totalPages = Math.ceil(totalPhotos / photosPerPage);
        const pagination = document.getElementById('pagination');
        const pageInfo = document.getElementById('pageInfo');
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');

        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        pageInfo.textContent = `Page ${currentPage} sur ${totalPages} (${totalPhotos} photos)`;
        
        prevBtn.disabled = currentPage <= 1;
        nextBtn.disabled = currentPage >= totalPages;
    }

    /**
     * Met à jour les boutons de filtre
     * @param {string} activeFilter - Filtre actif
     */
    updateFilterButtons(activeFilter) {
        document.querySelectorAll('.btn-filter').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === activeFilter);
        });
    }

    /**
     * Met à jour l'affichage du presse-papier GPS
     * @param {object} gpsData - Données GPS copiées
     * @param {string} sourcePhoto - Nom de la photo source
     */
    updateClipboard(gpsData, sourcePhoto) {
        const clipboardInfo = document.getElementById('clipboardInfo');
        const clipboardSource = document.getElementById('clipboardSource');
        const clipboardCoords = document.getElementById('clipboardCoords');
        
        if (gpsData) {
            clipboardSource.textContent = sourcePhoto;
            clipboardCoords.textContent = `${gpsData.latitude.toFixed(6)}, ${gpsData.longitude.toFixed(6)}`;
            clipboardInfo.style.display = 'block';
        } else {
            clipboardInfo.style.display = 'none';
        }
    }

    /**
     * Affiche la modal de confirmation
     * @param {string} title - Titre de la modal
     * @param {string} message - Message de la modal
     * @param {object} gpsData - Données GPS à afficher
     * @returns {Promise<boolean>} - True si confirmé
     */
    showConfirmModal(title, message, gpsData = null) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const modalCoords = document.getElementById('modalCoords');
            const confirmBtn = document.getElementById('confirmPasteBtn');
            const cancelBtn = document.getElementById('cancelPasteBtn');
            
            // Configurer la modal
            modal.querySelector('h3').textContent = title;
            modal.querySelector('p').textContent = message;
            
            if (gpsData) {
                modalCoords.textContent = `${gpsData.latitude.toFixed(6)}, ${gpsData.longitude.toFixed(6)}`;
                modalCoords.style.display = 'block';
            } else {
                modalCoords.style.display = 'none';
            }
            
            // Gestionnaires d'événements
            const handleConfirm = () => {
                modal.style.display = 'none';
                cleanup();
                resolve(true);
            };
            
            const handleCancel = () => {
                modal.style.display = 'none';
                cleanup();
                resolve(false);
            };
            
            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };
            
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            
            // Afficher la modal
            modal.style.display = 'flex';
        });
    }
}

// Export de l'instance UI
const ui = new UIManager();

// Styles CSS additionnels pour les animations
const additionalStyles = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;

// Ajouter les styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);
