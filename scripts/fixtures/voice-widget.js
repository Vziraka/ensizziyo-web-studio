// Local browser rehearsal only. Never copied into site/ or the production build.
customElements.define('elevenlabs-convai', class extends HTMLElement {
  connectedCallback() {
    for (const [label, capture, delay] of [['Start local rehearsal', true, 0], ['Rehearse no enquiry', false, 0], ['Rehearse delayed connection', true, 2000]]) {
      const button = document.createElement('button');
      button.textContent = label;
      button.style.cssText = 'display:block;margin:18px 0;padding:14px 20px;font:18px Manrope;border:1px solid #202020;border-radius:30px;background:#fff';
      button.onclick = () => {
        const detail = {config: {textOnly: true}};
        this.dispatchEvent(new CustomEvent('elevenlabs-convai:call', {bubbles: true, detail}));
        setTimeout(() => {
          const options = {...detail.config, onConnect() {}, onDisconnect() {}, onMessage() {}, onModeChange() {}};
          const session = {
            options,
            async endSession() {
              options.onDisconnect({reason: 'user'});
              let output = document.getElementById('qa-session-status');
              if (!output) { output = document.createElement('p'); output.id = 'qa-session-status'; document.body.append(output); }
              output.textContent = 'Local rehearsal session ended.';
            },
            sendUserMessage(message) {
              if (message === 'simulate message failure') throw new Error('Fictional send failure');
              options.onMessage({role: 'agent', message: 'Thanks. Your message was: ' + message});
            },
          };
          options.onConversationCreated?.(session);
          options.onConnect({});
          options.onModeChange({mode: 'listening'});
          options.onMessage({role: 'agent', message: 'Hi, I’m Evan. How can I help with your made-up request?'});
          options.onMessage({role: 'user', message: 'My AC is not cooling. I’m in Fairfax.'});
          options.onMessage({role: 'agent', message: 'What callback time would work for you?'});
          if (capture) options.clientTools.capture_enquiry({name: 'Casey Example', contact: '202-555-0108', service: 'AC not cooling', location: 'Fairfax', preferred_time: 'Tomorrow afternoon'});
        }, delay);
      };
      this.append(button);
    }
  }
});
