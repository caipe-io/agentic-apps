"use client";

import { createElement as h, useEffect, useState } from "react";

import { loadForecast } from "./client.mjs";
import { cityFromPath, DEFAULT_CITY, pathForCity, ROOT_PATH } from "./routes.mjs";

function temperature(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}°C`
    : "—";
}

function WeatherNative({ pathname, navigate, setBreadcrumbs }) {
  const routeCity = cityFromPath(pathname) || DEFAULT_CITY;
  const [city, setCity] = useState(routeCity);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setCity(routeCity);
    setBreadcrumbs([
      { label: "Home", href: "/" },
      { label: "Weather Lab", href: ROOT_PATH },
      ...(pathname !== ROOT_PATH ? [{ label: routeCity }] : []),
    ]);
    performance.mark?.("weather:native-render-ready");
  }, [pathname, routeCity, setBreadcrumbs]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadForecast(routeCity, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setForecast(value);
        setLoading(false);
        performance.mark?.("weather:native-data-ready");
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setForecast(null);
        setError(cause instanceof Error ? cause.message : "Weather is unavailable");
        setLoading(false);
      });
    return () => controller.abort();
  }, [routeCity, refresh]);

  function handleSubmit(event) {
    event.preventDefault();
    const route = pathForCity(city);
    if (!route) {
      setError("Enter a valid city name");
    } else if (route === pathname) {
      setRefresh((value) => value + 1);
    } else {
      navigate(route);
    }
  }

  const alerts = Array.isArray(forecast?.nationalWeatherAlerts?.alerts)
    ? forecast.nationalWeatherAlerts.alerts.slice(0, 3)
    : [];
  const days = Array.isArray(forecast?.daily) ? forecast.daily.slice(0, 5) : [];

  return h("main", { className: "caipe-weather-native" },
    h("header", { className: "caipe-weather-native__header" },
      h("div", null,
        h("p", { className: "caipe-weather-native__eyebrow" }, "Native extension example"),
        h("h1", null, "Weather Lab"),
        h("p", { className: "caipe-weather-native__muted" },
          "Live conditions from the existing Weather app, in the CAIPE shell."),
      ),
      h("form", { className: "caipe-weather-native__form", onSubmit: handleSubmit },
        h("label", { htmlFor: "caipe-weather-city" }, "City"),
        h("div", { className: "caipe-weather-native__form-row" },
          h("input", {
            id: "caipe-weather-city",
            value: city,
            onChange: (event) => setCity(event.target.value),
            maxLength: 80,
            required: true,
          }),
          h("button", { type: "submit", disabled: loading }, "Show weather"),
        ),
      ),
    ),
    error && h("p", { className: "caipe-weather-native__error", role: "alert" }, error),
    loading && h("p", { className: "caipe-weather-native__muted", role: "status" },
      `Loading weather for ${routeCity}…`),
    forecast && h("div", { className: "caipe-weather-native__grid" },
      h("section", { className: "caipe-weather-native__card caipe-weather-native__current" },
        h("p", { className: "caipe-weather-native__eyebrow" }, "Current conditions"),
        h("h2", null, [forecast.city, forecast.region].filter(Boolean).join(", ")),
        h("p", { className: "caipe-weather-native__temperature" }, temperature(forecast.current?.temperatureC)),
        h("p", null, forecast.current?.condition || "Conditions unavailable"),
        h("p", { className: "caipe-weather-native__muted" },
          `Feels like ${temperature(forecast.current?.apparentC)} · Humidity ${forecast.current?.humidity ?? "—"}%`),
      ),
      h("section", { className: "caipe-weather-native__card" },
        h("p", { className: "caipe-weather-native__eyebrow" }, "Daily guidance"),
        h("h2", null, forecast.dailyGuidance?.verdict || "Weather outlook"),
        h("p", null, forecast.dailyGuidance?.howIsMyDay || "No guidance available."),
        forecast.dailyGuidance?.bestWindow && h("p", { className: "caipe-weather-native__muted" },
          `Best window: ${forecast.dailyGuidance.bestWindow.label || forecast.dailyGuidance.bestWindow}`),
      ),
      h("section", { className: "caipe-weather-native__card" },
        h("p", { className: "caipe-weather-native__eyebrow" }, "Five-day forecast"),
        h("div", { className: "caipe-weather-native__days" },
          ...days.map((day) => h("div", { key: day.date, className: "caipe-weather-native__day" },
            h("strong", null, day.label || day.date),
            h("span", null, day.condition || "—"),
            h("span", null, `${temperature(day.highC)} / ${temperature(day.lowC)}`),
          )),
        ),
      ),
      h("section", { className: "caipe-weather-native__card" },
        h("p", { className: "caipe-weather-native__eyebrow" }, "Air quality and alerts"),
        h("h2", null, forecast.airQuality?.available
          ? `AQI ${forecast.airQuality.usAqi ?? "—"} · ${forecast.airQuality.category || "Unknown"}`
          : "Air quality unavailable"),
        alerts.length
          ? h("ul", null, ...alerts.map((alert, index) => h("li", { key: `${alert.event}-${index}` },
            `${alert.event}: ${alert.headline || alert.severity || "Active alert"}`)))
          : h("p", { className: "caipe-weather-native__muted" }, "No active alerts reported."),
      ),
    ),
  );
}

export default { contractVersion: "1.1", Component: WeatherNative };
