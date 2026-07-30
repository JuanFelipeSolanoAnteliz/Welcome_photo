(function () {
  "use strict";

  const poster = document.getElementById("poster");
  const photoZone = document.getElementById("photoZone");
  const photoInput = document.getElementById("photoInput");
  const btnPhoto = document.getElementById("btnPhoto");
  const btnDownload = document.getElementById("btnDownload");
  const btnReset = document.getElementById("btnReset");
  const nameEl = document.getElementById("name");

  const STORAGE_KEY = "parpal-welcome-state";

  // Guardamos la foto original (data URL) en su máxima resolución para
  // dibujarla nítida al exportar, sin depender de html2canvas.
  let originalPhotoDataUrl = "";

  /* ---------- Foto ---------- */
  function openPhotoPicker() {
    photoInput.click();
  }

  photoZone.addEventListener("click", openPhotoPicker);
  btnPhoto.addEventListener("click", openPhotoPicker);

  photoInput.addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      setPhoto(ev.target.result);
      saveState();
    };
    reader.readAsDataURL(file);
  });

  function setPhoto(dataUrl) {
    originalPhotoDataUrl = dataUrl;
    photoZone.style.backgroundImage = "url('" + dataUrl + "')";
    photoZone.classList.add("has-image");
  }

  // Extrae la data URL cruda desde el valor CSS background-image: url("...")
  function extractDataUrl(bgValue) {
    if (!bgValue) return "";
    const match = bgValue.match(/url\(["']?(.*?)["']?\)/);
    return match ? match[1] : "";
  }

  // Carga una imagen y devuelve una promesa con el elemento Image
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        resolve(img);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  /* ---------- Persistencia rápida (localStorage) ---------- */
  function getEditables() {
    return document.querySelectorAll("[contenteditable]");
  }

  function saveState() {
    const texts = {};
    getEditables().forEach(function (el, i) {
      texts[el.id || "field-" + i] = el.innerHTML;
    });
    const state = {
      texts: texts,
      photo: photoZone.classList.contains("has-image")
        ? photoZone.style.backgroundImage
        : "",
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* almacenamiento no disponible: se ignora */
    }
  }

  function loadState() {
    let state;
    try {
      state = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (err) {
      return;
    }
    if (!state) return;
    getEditables().forEach(function (el, i) {
      const key = el.id || "field-" + i;
      if (state.texts && typeof state.texts[key] === "string") {
        el.innerHTML = state.texts[key];
      }
    });
    if (state.photo) {
      photoZone.style.backgroundImage = state.photo;
      photoZone.classList.add("has-image");
      originalPhotoDataUrl = extractDataUrl(state.photo);
    }
  }

  getEditables().forEach(function (el) {
    el.addEventListener("input", saveState);
    // Pegar solo texto plano para mantener el formato limpio
    el.addEventListener("paste", function (e) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });
  });

  /* ---------- Reiniciar ---------- */
  btnReset.addEventListener("click", function () {
    if (!confirm("¿Borrar todo y empezar de nuevo?")) return;
    getEditables().forEach(function (el) {
      el.innerHTML = "";
    });
    photoZone.style.backgroundImage = "";
    photoZone.classList.remove("has-image");
    originalPhotoDataUrl = "";
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* ignore */
    }
    nameEl.focus();
  });

  /* ---------- Descargar como imagen ---------- */
  btnDownload.addEventListener("click", function () {
    if (typeof html2canvas === "undefined") {
      alert("No se pudo cargar el generador de imágenes. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    const original = btnDownload.textContent;
    btnDownload.textContent = "Generando...";
    btnDownload.disabled = true;

    // Quitar el foco para que no quede el resaltado de edición en la imagen
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    // Renderizamos a un ancho fijo de alta resolución (independiente del
    // tamaño en pantalla).
    const TARGET_WIDTH = 2480; // ~ancho de póster en alta resolución
    const scale = Math.max(2, TARGET_WIDTH / poster.offsetWidth);

    // Offset de layout del recuadro RELATIVO al póster (inmune al zoom del
    // preview, a diferencia de getBoundingClientRect).
    const layout = getLayoutOffset(photoZone, poster);

    // Ocultamos temporalmente la foto (versión de baja calidad que
    // rasterizaría html2canvas). La dibujaremos nosotros en alta resolución.
    const hadImage = photoZone.classList.contains("has-image");
    const prevBg = photoZone.style.backgroundImage;
    if (hadImage) {
      photoZone.style.backgroundImage = "none";
    }

    html2canvas(poster, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      imageTimeout: 0,
      logging: false,
    })
      .then(function (canvas) {
        // Restauramos la vista previa en pantalla
        if (hadImage) {
          photoZone.style.backgroundImage = prevBg;
        }

        // Si no hay foto, exportamos directo
        if (!hadImage || !originalPhotoDataUrl) {
          return canvas;
        }

        // Escala REAL que html2canvas aplicó (por si difiere de la pedida)
        const realScale = canvas.width / poster.offsetWidth;
        const photoBox = {
          x: layout.left * realScale,
          y: layout.top * realScale,
          w: photoZone.offsetWidth * realScale,
          h: photoZone.offsetHeight * realScale,
          radius: 22 * realScale, // border-radius del recuadro (22px en CSS)
        };

        // Dibujamos la foto original a máxima resolución dentro del recuadro
        return loadImage(originalPhotoDataUrl).then(function (img) {
          const ctx = canvas.getContext("2d");
          // html2canvas puede dejar una transformación (escala) activa en el
          // contexto; la reseteamos para trabajar en píxeles reales del canvas.
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          ctx.save();
          // Recorte con esquinas redondeadas que coincide con el recuadro
          roundedRectPath(ctx, photoBox.x, photoBox.y, photoBox.w, photoBox.h, photoBox.radius);
          ctx.clip();

          // Ajuste tipo "cover": llenar el recuadro sin deformar
          const boxRatio = photoBox.w / photoBox.h;
          const imgRatio = img.naturalWidth / img.naturalHeight;
          let drawW, drawH, drawX, drawY;
          if (imgRatio > boxRatio) {
            drawH = photoBox.h;
            drawW = drawH * imgRatio;
          } else {
            drawW = photoBox.w;
            drawH = drawW / imgRatio;
          }
          drawX = photoBox.x + (photoBox.w - drawW) / 2;
          drawY = photoBox.y + (photoBox.h - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
          return canvas;
        });
      })
      .then(function (canvas) {
        const link = document.createElement("a");
        const rawName = (nameEl.textContent || "bienvenida").trim();
        const safeName = rawName
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "") || "bienvenida";
        link.download = "parpal-" + safeName + ".png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      })
      .catch(function (err) {
        if (hadImage) {
          photoZone.style.backgroundImage = prevBg;
        }
        console.log("[v0] Error al generar la imagen:", err);
        alert("Ocurrió un error al generar la imagen.");
      })
      .finally(function () {
        btnDownload.textContent = original;
        btnDownload.disabled = false;
      });
  });

  // Suma offsetLeft/offsetTop de layout desde un elemento hasta un ancestro.
  // Usa coordenadas de layout (no visuales), que coinciden con html2canvas.
  function getLayoutOffset(el, ancestor) {
    let left = 0;
    let top = 0;
    let node = el;
    while (node && node !== ancestor) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return { left: left, top: top };
  }

  // Dibuja el trazado de un rectángulo con esquinas redondeadas
  function roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* ---------- Init ---------- */
  loadState();
})();
