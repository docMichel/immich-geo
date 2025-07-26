/**
 * UI.JS - Interface utilisateur (VERSION PROPRE)
 */

class UI {
    constructor() {
        this.messageContainer = document.getElementById('messageContainer');
    }

    /**
     * Affiche un message
     */
    showMessage(text, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = text;
        
        this.messageContainer.appendChild(messageEl);
        
        // Supprimer après 3 secondes
        setTimeout(() => {
            if (messageEl.parentNode) {
                messageEl.parentNode.removeChild(messageEl);
            }
        }, 3000);
        
        console.log(`${type.toUpperCase()}: ${text}`);
    }

    /**
     * Met à jour la barre de progression
     */
    updateProgress(percent, text, show = true) {
        const container = document.getElementById('progressContainer');
        const fill = document.getElementById('progressFill');
        const textEl = document.getElementById('progressText');
        
        if (show && percent > 0) {
            container.style.display = 'block';
            fill.style.width = `${percent}%`;
            textEl.textContent = text;
        } else {
            container.style.display = 'none';
        }
    }

    /**
     * Affiche/masque une section
     */
    toggleSection(sectionId, show) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = show ? 'block' : 'none';
        }
    }

    /**
     * Active/désactive un bouton
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
     * Met à jour les sélecteurs d'année et mois
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
        
        this.toggleSection('dateSelectors', true);
        this.toggleSection('periodInfo', true);
        
        document.getElementById('periodInfo').innerHTML = 
            `${timeBuckets.length} périodes disponibles (${years[0]} - ${years[years.length-1]})`;
    }

    /**
     * Met à jour le sélecteur de mois
     */
    updateMonthSelector(timeBuckets, selectedYear) {
        const monthSelect = document.getElementById('monthSelect');
        
        if (!selectedYear) {
            monthSelect.innerHTML = '<option value="">Sélectionner un mois...</option>';
            monthSelect.disabled = true;
            return;
        }

        // Mois pour cette année
        const monthsInYear = timeBuckets
            .filter(bucket => bucket.timeBucket.startsWith(selectedYear + '-'))
            .map(bucket => {
                const month = bucket.timeBucket.substring(5, 7);
                return {
                    value: month,
                    name: this.getMonthName(month),
                    count: bucket.count
                };
            })
            .sort((a, b) => b.value.localeCompare(a.value));

        monthSelect.innerHTML = '<option value="">Toute l\'année</option>' +
            monthsInYear.map(month => 
                `<option value="${month.value}">${month.name} ${selectedYear} (${month.count} photos)</option>`
            ).join('');
        
        monthSelect.disabled = false;
        this.toggleButton('loadPhotosBtn', true);
    }

    /**
     * Nom du mois
     */
    getMonthName(monthNum) {
        const months = [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        return months[parseInt(monthNum) - 1] || monthNum;
    }

    /**
     * Met à jour les statistiques
     */
    updateStats(stats) {
        document.getElementById('totalPhotos').textContent = stats.total || 0;
        document.getElementById('analyzedPhotos').textContent = stats.analyzed || 0;
        document.getElementById('gpsPhotos').textContent = stats.withGPS || 0;
        document.getElementById('noGpsPhotos').textContent = (stats.analyzed || 0) - (stats.withGPS || 0);
    }
}

// Instance globale unique
const ui = new UI();