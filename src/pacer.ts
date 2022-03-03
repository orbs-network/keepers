//////////////////////////////////////
export class Pacer {
    //////////////////////////////////////
    getEpochUnitMS() {
        return 60 * 1000;
    }
    //////////////////////////////////////
    getEpochIndex() {
        return Math.floor(Date.now() / this.getEpochUnitMS());
    }
}