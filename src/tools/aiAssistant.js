/**
 * Cliente ligero para conectar DeepSeek o Mistral mediante JavaScript nativo (Fetch)
 * Ideal para entornos móviles o web sin dependencias externas.
 */
class AIAssistant {
    constructor(apiKey, provider = 'deepseek') {
        this.apiKey = apiKey;
        
        // Configuración de endpoints compatibles con formato OpenAI
        if (provider === 'deepseek') {
            this.endpoint = 'https://api.deepseek.com/chat/completions';
            this.model = 'deepseek-chat';
        } else if (provider === 'mistral') {
            this.endpoint = 'https://api.mistral.ai/v1/chat/completions';
            this.model = 'mistral-small-latest';
        }
    }

    async generateCode(promptText) {
        try {
            console.log('Consultando a la IA...');
            
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { 
                            role: 'system', 
                            content: 'Eres un arquitecto experto en JavaScript, motores 3D con Babylon.js y sistemas de combate.' 
                        },
                        { 
                            role: 'user', 
                            content: promptText 
                        }
                    ],
                    temperature: 0.3,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Error en la petición: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.choices && data.choices.length > 0) {
                return data.choices[0].message.content;
            } else {
                throw new Error('La respuesta no contiene opciones válidas.');
            }

        } catch (error) {
            console.error('Error al conectar con el servicio de IA:', error);
            return null;
        }
    }
}

// Ejemplo de uso:
// const ai = new AIAssistant("TU_API_KEY_AQUI", "deepseek");
// ai.generateCode("Escribe la estructura base de la clase FighterStateMachine.js").then(code => console.log(code));
