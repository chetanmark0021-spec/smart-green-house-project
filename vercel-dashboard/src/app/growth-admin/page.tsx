
"use client";

import { useEffect, useState } from "react";
import "./growth-admin.css";

type Plant = {
  id: string;
  plant_name: string;
  plant_type: string;
};

export default function GrowthAdminPage() {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  // Plant registration
  const [plantName, setPlantName] = useState("");
  const [plantType, setPlantType] = useState("");
  const [location, setLocation] = useState("");
  const [plantingDate, setPlantingDate] = useState("");

  // Registered plants
  const [plants, setPlants] = useState<Plant[]>([]);

  // Growth recording
  const [selectedPlant, setSelectedPlant] = useState("");
  const [measuredOn, setMeasuredOn] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [leafCount, setLeafCount] = useState("");
  const [growthStage, setGrowthStage] = useState("Seedling");
  const [healthScore, setHealthScore] = useState("80");
  const [growthNotes, setGrowthNotes] = useState("");

  // Plant care recording
  const [careType, setCareType] = useState("Watering");
  const [careDate, setCareDate] = useState("");
  const [careAmount, setCareAmount] = useState("");
  const [careUnit, setCareUnit] = useState("");
  const [careNotes, setCareNotes] = useState("");

  // Load registered plants
  useEffect(() => {
    async function loadPlants() {
      try {
        const response = await fetch("/api/growth", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();
        setPlants(data.plants || []);

        if (data.plants?.length > 0) {
          setSelectedPlant((current) => current || data.plants[0].id);
        }
      } catch (error) {
        console.error("Unable to load plants:", error);
      }
    }

    loadPlants();
  }, []);

  // Register new plant
  async function handleAddPlant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!plantName.trim() || !plantType.trim() || !plantingDate) {
      setMessageType("error");
      setMessage("Please enter the plant name, type and planting date.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/growth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "add-plant",
          plant_name: plantName.trim(),
          plant_type: plantType.trim(),
          location: location.trim(),
          planting_date: plantingDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(data.error || "Unable to register plant.");
        return;
      }

      setPlantName("");
      setPlantType("");
      setLocation("");
      setPlantingDate("");

      setMessageType("success");
      setMessage("Plant registered successfully!");

      // Refresh registered plants
      const refreshResponse = await fetch("/api/growth", {
        cache: "no-store",
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        const updatedPlants = refreshData.plants || [];

        setPlants(updatedPlants);

        if (updatedPlants.length > 0) {
          setSelectedPlant((current) => current || updatedPlants[0].id);
        }
      }
    } catch {
      setMessageType("error");
      setMessage("Unable to connect to the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Record plant growth
  async function handleAddGrowth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPlant || !measuredOn || !heightCm || !leafCount) {
      setMessageType("error");
      setMessage("Please complete all required growth fields.");
      return;
    }

    const height = Number(heightCm);
    const leaves = Number(leafCount);
    const health = Number(healthScore);

    if (
      !Number.isFinite(height) ||
      height < 0 ||
      !Number.isInteger(leaves) ||
      leaves < 0 ||
      !Number.isInteger(health) ||
      health < 0 ||
      health > 100
    ) {
      setMessageType("error");
      setMessage("Enter valid height, leaf count and health score (0–100).");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/growth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "add-growth",
          plant_id: selectedPlant,
          measured_on: measuredOn,
          height_cm: height,
          leaf_count: leaves,
          growth_stage: growthStage,
          health_score: health,
          notes: growthNotes.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(data.error || "Unable to save growth record.");
        return;
      }

      setHeightCm("");
      setLeafCount("");
      setGrowthStage("Seedling");
      setHealthScore("80");
      setGrowthNotes("");

      setMessageType("success");
      setMessage("Plant growth record saved successfully!");
    } catch {
      setMessageType("error");
      setMessage("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Record plant care
  async function handleAddCare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPlant || !careDate) {
      setMessageType("error");
      setMessage("Please select a plant and care date.");
      return;
    }

    const amount = careAmount.trim()
      ? Number(careAmount)
      : null;

    if (
      amount !== null &&
      (!Number.isFinite(amount) || amount < 0)
    ) {
      setMessageType("error");
      setMessage("Please enter a valid care amount.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/growth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "add-care",
          plant_id: selectedPlant,
          care_type: careType,
          amount,
          unit: careUnit.trim() || null,
          notes: careNotes.trim(),
          performed_at: new Date(
            `${careDate}T12:00:00`
          ).toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessageType("error");
        setMessage(data.error || "Unable to save care record.");
        return;
      }

      setCareType("Watering");
      setCareDate("");
      setCareAmount("");
      setCareUnit("");
      setCareNotes("");

      setMessageType("success");
      setMessage("Plant care record saved successfully!");
    } catch {
      setMessageType("error");
      setMessage("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="growth-admin-page">
      <div className="admin-card">
        <div className="admin-brand">GREENMIND</div>
        <div className="admin-icon">🌱</div>

        <h1>Plant Management</h1>

        <p className="admin-description">
          Manage plant records and greenhouse care logs.
        </p>

        <div className="admin-management">

            {/* Register New Plant */}
            <div className="plant-form-heading">
              <h2>Register New Plant</h2>
              <p>Add a plant to your greenhouse database.</p>
            </div>

            <form onSubmit={handleAddPlant} className="plant-form">

              <label htmlFor="plant-name">Plant Name *</label>
              <input
                id="plant-name"
                type="text"
                value={plantName}
                onChange={(event) => setPlantName(event.target.value)}
                placeholder="Example: Tomato"
                required
              />

              <label htmlFor="plant-type">Plant Type *</label>
              <input
                id="plant-type"
                type="text"
                value={plantType}
                onChange={(event) => setPlantType(event.target.value)}
                placeholder="Example: Vegetable"
                required
              />

              <label htmlFor="plant-location">Location</label>
              <input
                id="plant-location"
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Example: Greenhouse A"
              />

              <label htmlFor="planting-date">Planting Date *</label>
              <input
                id="planting-date"
                type="date"
                value={plantingDate}
                onChange={(event) => setPlantingDate(event.target.value)}
                required
              />

              <button
                type="submit"
                className="admin-button"
                disabled={submitting}
              >
                {submitting ? "Saving Plant..." : "+ Register Plant"}
              </button>

            </form>

            {/* Record Plant Growth */}
            <div className="plant-form-heading growth-heading">
              <h2>Record Plant Growth</h2>
              <p>Track plant development and health measurements.</p>
            </div>

            <form onSubmit={handleAddGrowth} className="plant-form">

              <label htmlFor="growth-plant">Select Plant *</label>
              <select
                id="growth-plant"
                value={selectedPlant}
                onChange={(event) => setSelectedPlant(event.target.value)}
                required
              >
                <option value="">Choose a registered plant</option>

                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.plant_name} ({plant.plant_type})
                  </option>
                ))}
              </select>

              <label htmlFor="measured-on">Measurement Date *</label>
              <input
                id="measured-on"
                type="date"
                value={measuredOn}
                onChange={(event) => setMeasuredOn(event.target.value)}
                required
              />

              <label htmlFor="height-cm">Plant Height (cm) *</label>
              <input
                id="height-cm"
                type="number"
                min="0"
                step="0.1"
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
                placeholder="Example: 15.5"
                required
              />

              <label htmlFor="leaf-count">Number of Leaves *</label>
              <input
                id="leaf-count"
                type="number"
                min="0"
                step="1"
                value={leafCount}
                onChange={(event) => setLeafCount(event.target.value)}
                placeholder="Example: 12"
                required
              />

              <label htmlFor="growth-stage">Growth Stage *</label>
              <select
                id="growth-stage"
                value={growthStage}
                onChange={(event) => setGrowthStage(event.target.value)}
              >
                <option value="Seedling">Seedling</option>
                <option value="Vegetative">Vegetative</option>
                <option value="Flowering">Flowering</option>
                <option value="Fruiting">Fruiting</option>
                <option value="Harvesting">Harvesting</option>
              </select>

              <label htmlFor="health-score">
                Plant Health Score (0–100) *
              </label>
              <input
                id="health-score"
                type="number"
                min="0"
                max="100"
                step="1"
                value={healthScore}
                onChange={(event) => setHealthScore(event.target.value)}
                required
              />

              <label htmlFor="growth-notes">Growth Notes</label>
              <textarea
                id="growth-notes"
                value={growthNotes}
                onChange={(event) => setGrowthNotes(event.target.value)}
                placeholder="Describe plant growth or observations..."
                rows={3}
              />

              <button
                type="submit"
                className="admin-button"
                disabled={submitting || plants.length === 0}
              >
                {submitting ? "Saving Record..." : "+ Save Growth Record"}
              </button>

              {plants.length === 0 && (
                <p className="admin-message error">
                  No registered plants found. Register a plant first.
                </p>
              )}

            </form>

            {/* Record Plant Care */}
            <div className="plant-form-heading growth-heading">
              <h2>Record Plant Care</h2>
              <p>Maintain a history of greenhouse care activities.</p>
            </div>

            <form onSubmit={handleAddCare} className="plant-form">

              <label htmlFor="care-plant">Select Plant *</label>
              <select
                id="care-plant"
                value={selectedPlant}
                onChange={(event) => setSelectedPlant(event.target.value)}
                required
              >
                <option value="">Choose a registered plant</option>

                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.plant_name} ({plant.plant_type})
                  </option>
                ))}
              </select>

              <label htmlFor="care-type">Care Activity *</label>
              <select
                id="care-type"
                value={careType}
                onChange={(event) => setCareType(event.target.value)}
              >
                <option value="Watering">Watering</option>
                <option value="Fertilizer">Fertilizer</option>
                <option value="Pesticide">Pesticide</option>
                <option value="Pruning">Pruning</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Other">Other</option>
              </select>

              <label htmlFor="care-date">Care Date *</label>
              <input
                id="care-date"
                type="date"
                value={careDate}
                onChange={(event) => setCareDate(event.target.value)}
                required
              />

              <label htmlFor="care-amount">Amount (optional)</label>
              <input
                id="care-amount"
                type="number"
                min="0"
                step="any"
                value={careAmount}
                onChange={(event) => setCareAmount(event.target.value)}
                placeholder="Example: 500"
              />

              <label htmlFor="care-unit">Unit (optional)</label>
              <input
                id="care-unit"
                type="text"
                value={careUnit}
                onChange={(event) => setCareUnit(event.target.value)}
                placeholder="Example: ml, grams, litres"
              />

              <label htmlFor="care-notes">Care Notes</label>
              <textarea
                id="care-notes"
                value={careNotes}
                onChange={(event) => setCareNotes(event.target.value)}
                placeholder="Describe the care activity..."
                rows={3}
              />

              <button
                type="submit"
                className="admin-button"
                disabled={submitting || plants.length === 0}
              >
                {submitting ? "Saving Care Record..." : "+ Save Care Record"}
              </button>

            </form>

        </div>

        {message && (
          <p className={`admin-message ${messageType}`} role="status">
            {message}
          </p>
        )}

        <a className="dashboard-link" href="/growth-tracker">
          ← Back to Public Growth Tracker
        </a>

        <p className="admin-footer">
          GreenMind Smart Greenhouse
        </p>
      </div>
    </main>
  );
}
